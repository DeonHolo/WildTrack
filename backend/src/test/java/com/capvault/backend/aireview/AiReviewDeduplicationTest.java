package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.capvault.backend.deliverable.*;
import com.capvault.backend.drive.*;
import com.capvault.backend.filecheck.*;
import com.capvault.backend.response.*;
import com.capvault.backend.staff.*;
import com.capvault.backend.template.DocumentTemplateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.access.AccessDeniedException;

class AiReviewDeduplicationTest {
    private final UUID workspace = UUID.randomUUID(), deliverableId = UUID.randomUUID();
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final DeliverableRepository deliverables = mock(DeliverableRepository.class);
    private final DocumentTemplateService templates = mock(DocumentTemplateService.class);
    private final GoogleDriveGateway drive = mock(GoogleDriveGateway.class);
    private final PdfInspector pdf = mock(PdfInspector.class);
    private final ReviewFeedbackService access = mock(ReviewFeedbackService.class);
    private final StaffAccessResolver roles = mock(StaffAccessResolver.class);
    private final AiReviewProvider provider = mock(AiReviewProvider.class);
    private final Map<String, byte[]> files = new java.util.concurrent.ConcurrentHashMap<>();
    private JdbcTemplate jdbc;
    private DriverManagerDataSource datasource;
    private AiReviewStore store;
    private AiReviewService service;
    private Deliverable deliverable;
    private FormResponse first, second;
    private final AiReviewProvider.Result result = new AiReviewProvider.Result("Evidence-based feedback", List.of(), List.of("Limitations"), "Review the highlighted section.");

    @BeforeEach void setup() {
        datasource = new DriverManagerDataSource("jdbc:h2:mem:ai_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(datasource);
        jdbc.execute("CREATE TABLE academic_workspaces(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE academic_deliverables(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE form_responses(id UUID PRIMARY KEY)");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V18__deduplicated_ai_reviews.sql")).execute(datasource);
        jdbc.update("INSERT INTO academic_workspaces VALUES (?)", workspace);
        jdbc.update("INSERT INTO academic_deliverables VALUES (?)", deliverableId);
        store = new AiReviewStore(jdbc, new DataSourceTransactionManager(datasource), Clock.systemUTC());
        service = newService(store);
        deliverable = new Deliverable(workspace, "SRS", "Requirements", "srs", "Check requirements", LocalDateTime.now(), true, DeliverableStatus.PUBLISHED);
        when(deliverables.findById(deliverableId)).thenReturn(Optional.of(deliverable));
        when(roles.activeRolesFor("admin")).thenReturn(Set.of(StaffRole.ADMIN));
        when(provider.isConfigured()).thenReturn(true);
        when(provider.cacheVersion()).thenReturn("fake-provider:model-1:temperature-0");
        when(provider.review(any())).thenReturn(result);
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any())).thenAnswer(inv -> {
            var ref = inv.getArgument(0, DriveFileReference.class);
            return new DriveFileMetadata(ref.fileId(), "document.pdf", "application/pdf", 100L, "same-checksum",
                OffsetDateTime.parse("2026-09-09T00:00:00Z"), true, "");
        });
        when(drive.download(any())).thenAnswer(inv -> files.get(inv.getArgument(0, DriveFileReference.class).fileId()));
        when(pdf.inspect(any())).thenReturn(new PdfInspection(true, false, 4, 500, "Document text", ""));
        first = response("file-first", "team-one"); second = response("file-second", "team-one");
    }

    private AiReviewService newService(AiReviewStore storage) {
        return newService(storage, Runnable::run);
    }
    private AiReviewService newService(AiReviewStore storage, java.util.concurrent.Executor executor) {
        return new AiReviewService(provider, storage, responses, deliverables, templates, drive,
            new GoogleDriveProperties(true, "", 25_000_000), pdf, access, roles, new ObjectMapper(), executor);
    }
    private FormResponse response(String fileId, String team) {
        var response = new FormResponse(UUID.randomUUID(), workspace, deliverableId, fileId, fileId + "@example.com", UUID.randomUUID(), fileId,
            "Student", team, "{\"documentPdf\":\"https://drive.google.com/file/d/" + fileId + "/view\"}", Instant.now(), Instant.now());
        when(responses.findById(response.getId())).thenReturn(Optional.of(response));
        jdbc.update("INSERT INTO form_responses VALUES (?)", response.getId());
        files.put(fileId, "%PDF-identical-document-bytes".getBytes(StandardCharsets.UTF_8));
        return response;
    }
    private AiReviewService.View run(FormResponse response) { return service.review(workspace, response.getId(), "admin", false); }

    @Test void backgroundReviewReturnsImmediatelyAndDuplicateResponsesPollTheSameJob() {
        var tasks = new java.util.ArrayList<Runnable>();
        service = newService(store, tasks::add);
        assertThat(run(first).status()).isEqualTo("RUNNING");
        assertThat(run(second).status()).isEqualTo("RUNNING");
        assertThat(tasks).hasSize(1);
        verify(provider, never()).review(any());
        tasks.get(0).run();
        assertThat(service.saved(workspace, first.getId(), "admin").status()).isEqualTo("COMPLETED");
        assertThat(service.saved(workspace, second.getId(), "admin").status()).isEqualTo("COMPLETED");
        verify(provider, times(1)).review(any());
    }

    @Test void fullWorkerDoesNotLeaveJobRunningOrCallGemini() {
        service = newService(store, task -> { throw new java.util.concurrent.RejectedExecutionException(); });
        var rejected = run(first);
        assertThat(rejected.status()).isEqualTo("UNCERTAIN");
        assertThat(rejected.message()).contains("queue is full");
        verify(provider, never()).review(any());
    }

    @Test void identicalFilesAtDifferentLinksReuseOnePersistedReviewAndKeepBothResponses() {
        assertThat(run(first).reused()).isFalse();
        assertThat(run(second).reused()).isTrue();
        verify(provider, times(1)).review(any());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_jobs", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_response_links", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM form_responses", Integer.class)).isEqualTo(2);
        var restarted = newService(new AiReviewStore(jdbc, new DataSourceTransactionManager(datasource), Clock.systemUTC()));
        assertThat(restarted.review(workspace, second.getId(), "admin", false).reused()).isTrue();
        assertThat(restarted.savedFor(List.of(first, second))).hasSize(2);
        verify(provider, times(1)).review(any());
    }

    @Test void simultaneousRequestsAcrossServiceInstancesMakeOnlyOneProviderCall() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        when(provider.review(any())).thenAnswer(inv -> { entered.countDown(); assertThat(release.await(5, TimeUnit.SECONDS)).isTrue(); return result; });
        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = executor.submit(() -> run(first));
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                var other = newService(new AiReviewStore(jdbc, new DataSourceTransactionManager(datasource), Clock.systemUTC()));
                assertThat(other.review(workspace, second.getId(), "admin", false).status()).isEqualTo("RUNNING");
            } finally { release.countDown(); }
            assertThat(pending.get(5, TimeUnit.SECONDS).status()).isEqualTo("COMPLETED");
            assertThat(run(second).reused()).isTrue();
            verify(provider, times(1)).review(any());
        }
    }

    @Test void documentRequirementsTemplateAndModelChangesInvalidateReuse() {
        run(first);
        files.put("file-first", "%PDF-new-document-bytes".getBytes(StandardCharsets.UTF_8));
        assertThat(run(first).reused()).isFalse();
        deliverable.setInstructions("Updated requirements");
        assertThat(service.saved(workspace, first.getId(), "admin").status()).isEqualTo("NOT_REVIEWED");
        assertThat(run(first).reused()).isFalse();
        var template = mock(com.capvault.backend.template.DocumentTemplate.class);
        when(template.getSha256()).thenReturn("updated-template"); when(template.getExtractedText()).thenReturn("New template requirements");
        when(templates.find(workspace, "SRS")).thenReturn(template);
        assertThat(run(first).reused()).isFalse();
        when(provider.cacheVersion()).thenReturn("fake-provider:model-2:temperature-0");
        assertThat(run(first).reused()).isFalse();
        verify(provider, times(5)).review(any());
    }

    @Test void uncertainProviderFailuresRequireExplicitRetryAndAreNeverTreatedAsSuccess() {
        when(provider.review(any())).thenThrow(new IllegalStateException("Network timeout"));
        assertThat(run(first).status()).isEqualTo("UNCERTAIN");
        assertThat(run(second).status()).isEqualTo("UNCERTAIN");
        verify(provider, times(1)).review(any());
        var oldToken = run(first).retryToken();
        var retried = service.review(workspace, first.getId(), "admin", true, oldToken);
        assertThat(retried.status()).isEqualTo("UNCERTAIN");
        assertThat(service.review(workspace, second.getId(), "admin", true, oldToken).status()).isEqualTo("UNCERTAIN");
        verify(provider, times(2)).review(any()); // One explicit retry, even across duplicate student responses.
        doReturn(result).when(provider).review(any());
        assertThat(service.review(workspace, second.getId(), "admin", true, retried.retryToken()).status()).isEqualTo("COMPLETED");
        assertThat(run(first).reused()).isTrue();
        verify(provider, times(3)).review(any());
    }

    @Test void changedResponseDuringReviewDoesNotReceiveAnObsoleteResult() {
        when(provider.review(any())).thenAnswer(inv -> { first.setValuesJson("{\"documentPdf\":\"https://drive.google.com/file/d/replacement/view\"}"); return result; });
        // A repository read returns a fresh entity, as with open-in-view disabled in the application.
        var original = new FormResponse(first.getId(), workspace, deliverableId, "s", "e", UUID.randomUUID(), "n", "N", "team-one", first.getValuesJson(), first.getSubmittedAt(), first.getUpdatedAt());
        when(responses.findById(first.getId())).thenReturn(Optional.of(original), Optional.of(original), Optional.of(first));
        assertThatThrownBy(() -> run(first)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_response_links", Integer.class)).isZero();
    }

    @Test void disabledProviderMakesNoDownloadsOrProviderCallsAndStaffScopeIsEnforced() {
        when(provider.isConfigured()).thenReturn(false);
        assertThat(run(first).status()).isEqualTo("UNAVAILABLE");
        verify(drive, never()).download(any()); verify(provider, never()).review(any());
        assertThatThrownBy(() -> service.review(UUID.randomUUID(), first.getId(), "admin", false))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        when(roles.activeRolesFor("adviser")).thenReturn(Set.of(StaffRole.ADVISER));
        assertThatThrownBy(() -> service.review(workspace, first.getId(), "adviser", false)).isInstanceOf(AccessDeniedException.class);
        doThrow(new AccessDeniedException("Unassigned team")).when(access).requireStaffTeamAccess(first.getId(), "adviser", "ADVISER");
        assertThatThrownBy(() -> service.saved(workspace, first.getId(), "adviser")).isInstanceOf(AccessDeniedException.class);
    }

    @Test void identicalDocumentsFromDifferentTeamsAreNotShared() {
        run(first);
        assertThat(run(response("other-team-file", "team-two")).reused()).isFalse();
        verify(provider, times(2)).review(any());
    }
}
