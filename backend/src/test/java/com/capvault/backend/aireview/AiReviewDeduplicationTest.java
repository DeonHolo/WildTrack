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
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.server.ResponseStatusException;

class AiReviewDeduplicationTest {
    private final UUID workspace = UUID.randomUUID(), deliverableId = UUID.randomUUID();
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final DeliverableRepository deliverables = mock(DeliverableRepository.class);
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
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
    private final AiReviewProvider.Result result = new AiReviewProvider.Result(
        "Evidence-based feedback",
        List.of(new AiReviewProvider.Finding("The submitted PDF contains a document-level issue.",
            AiReviewProvider.FindingSource.DOCUMENT, "Page 2", "")),
        List.of(), List.of(), "Review the highlighted section.");

    @BeforeEach void setup() {
        datasource = new DriverManagerDataSource("jdbc:h2:mem:ai_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(datasource);
        jdbc.execute("CREATE TABLE academic_workspaces(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE academic_deliverables(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE form_responses(id UUID PRIMARY KEY)");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V18__deduplicated_ai_reviews.sql")).execute(datasource);
        jdbc.execute("""
            CREATE TABLE ai_review_field_links(
                response_id UUID NOT NULL REFERENCES form_responses(id),
                field_id VARCHAR(80) NOT NULL,
                source_value_sha256 VARCHAR(64) NOT NULL,
                cache_key VARCHAR(64) NOT NULL REFERENCES ai_review_jobs(cache_key),
                PRIMARY KEY(response_id, field_id)
            )
            """);
        jdbc.update("INSERT INTO academic_workspaces VALUES (?)", workspace);
        jdbc.update("INSERT INTO academic_deliverables VALUES (?)", deliverableId);
        store = new AiReviewStore(jdbc, new DataSourceTransactionManager(datasource), Clock.systemUTC());
        service = newService(store);
        deliverable = new Deliverable(workspace, "SRS", "Requirements", "srs", "Check requirements", LocalDateTime.now(), true, DeliverableStatus.PUBLISHED);
        ReflectionTestUtils.setField(deliverable, "id", deliverableId);
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
        return new AiReviewService(provider, storage, responses, deliverables, fields, templates, drive,
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

    @Test void missingSubmittedDriveFileFailsBeforeClaimWithActionable422() {
        doThrow(new GoogleDriveUnavailableException("Private Drive 404 text should not leak",
            new HttpClientErrorException(HttpStatus.NOT_FOUND)))
            .when(drive).getMetadata(any());
        assertPreclaimDriveFailure(HttpStatus.UNPROCESSABLE_ENTITY,
            "The submitted Drive PDF could not be opened.");
        verify(drive, never()).download(any());
    }

    @Test void inaccessibleDriveDownloadFailsBeforeClaimWithActionable422() {
        doThrow(new GoogleDriveUnavailableException("Private Drive 403 text should not leak",
            new HttpClientErrorException(HttpStatus.FORBIDDEN)))
            .when(drive).download(any());
        assertPreclaimDriveFailure(HttpStatus.UNPROCESSABLE_ENTITY,
            "The submitted Drive PDF could not be opened.");
        verify(drive, times(1)).getMetadata(any());
    }

    @Test void secondMetadataFailureFailsBeforeClaimWithoutStartingGemini() {
        var firstMetadata = new DriveFileMetadata("file-first", "document.pdf", "application/pdf", 100L,
            "same-checksum", OffsetDateTime.parse("2026-09-09T00:00:00Z"), true, "");
        doReturn(firstMetadata).doThrow(new GoogleDriveUnavailableException("Private Drive 404 detail",
            new HttpClientErrorException(HttpStatus.NOT_FOUND)))
            .when(drive).getMetadata(any());
        assertPreclaimDriveFailure(HttpStatus.UNPROCESSABLE_ENTITY,
            "The submitted Drive PDF could not be opened.");
        verify(drive).download(any());
        verify(drive, times(2)).getMetadata(any());
    }

    @Test void upstreamDriveFailureBeforeClaimIs503NotDocumentSpecific422() {
        doThrow(new GoogleDriveUnavailableException("Private backend/provider information",
            new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE)))
            .when(drive).getMetadata(any());
        assertPreclaimDriveFailure(HttpStatus.SERVICE_UNAVAILABLE,
            "WildTrack could not retrieve the submitted PDF from Google Drive.");
    }

    private void assertPreclaimDriveFailure(HttpStatus expectedStatus, String expectedMessage) {
        var tasks = new java.util.ArrayList<Runnable>();
        service = newService(store, tasks::add);
        assertThatThrownBy(() -> run(first))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(problem -> {
                var http = (ResponseStatusException) problem;
                assertThat(http.getStatusCode()).isEqualTo(expectedStatus);
                assertThat(http.getReason()).startsWith(expectedMessage)
                    .contains("No AI review was started.")
                    .doesNotContain("Private", "file-first", "403", "404");
            });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_jobs", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_response_links", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_field_links", Integer.class)).isZero();
        assertThat(tasks).isEmpty();
        verify(provider, never()).review(any());
    }

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

    @Test void deliberateRerunCallsGeminiAgainAndReplacesSavedReviewForAllIdenticalTeamFiles() {
        assertThat(run(first).status()).isEqualTo("COMPLETED");
        assertThat(run(second).reused()).isTrue();
        verify(provider, times(1)).review(any());

        var updated = new AiReviewProvider.Result(
            "Updated verified document feedback",
            List.of(new AiReviewProvider.Finding("The current PDF has an updated issue.",
                AiReviewProvider.FindingSource.DOCUMENT, "Current PDF page 2", "")),
            List.of(), List.of(), "Read the new review.");
        when(provider.review(any())).thenReturn(updated);
        var rerun = service.review(workspace, first.getId(), null, "admin", false, null, true);
        assertThat(rerun.status()).isEqualTo("COMPLETED");
        assertThat(rerun.reused()).isFalse();
        assertThat(rerun.report().summary()).contains("updated issue");
        assertThat(service.saved(workspace, second.getId(), "admin").report().summary()).contains("updated issue");
        assertThat(run(second).reused()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_jobs", Integer.class)).isEqualTo(1);
        verify(provider, times(2)).review(any());
    }

    @Test void aProviderResponseWithNoStructuredFindingsIsNotSavedAsACompletedReview() {
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result("Looks fine", List.of(),
            List.of(), List.of(), "No changes needed"));

        var inconclusive = run(first);
        assertThat(inconclusive.status()).isEqualTo("UNCERTAIN");
        assertThat(inconclusive.failureCode()).isEqualTo("NO_GROUNDED_FINDINGS");
        assertThat(inconclusive.report()).isNull();
        assertThat(inconclusive.retryToken()).isNotNull();
        assertThat(inconclusive.message()).contains("inconclusive", "not a clean pass");
        assertThat(service.saved(workspace, second.getId(), "admin").status()).isEqualTo("NOT_REVIEWED");
        assertThat(run(first).status()).isEqualTo("UNCERTAIN");
        verify(provider, times(1)).review(any());

        when(provider.review(any())).thenReturn(result);
        var repaired = service.review(workspace, first.getId(), "admin", true, inconclusive.retryToken());
        assertThat(repaired.status()).isEqualTo("COMPLETED");
        assertThat(repaired.report().findings()).hasSize(1);
        verify(provider, times(2)).review(any());
    }

    @Test void aNoIssuesReviewCanBeInformativeWhenMultipleIndependentPdfObservationsAreVerified() {
        when(pdf.inspect(any())).thenReturn(new PdfInspection(true, false, 84, 1000, """
            Software Requirements Specification
            Trevora stores vehicle service records and rejects duplicate entries.
            The validation section describes required fields and supported user roles.
            """, ""));
        var observations = List.of(
            new AiReviewProvider.VerifiedCheck("Service record scope is described",
                AiReviewProvider.FindingSource.DOCUMENT,
                "Trevora stores vehicle service records and rejects duplicate entries", ""),
            new AiReviewProvider.VerifiedCheck("Validation responsibilities are described",
                AiReviewProvider.FindingSource.DOCUMENT,
                "The validation section describes required fields and supported user roles", ""));
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result("Everything is perfect", List.of(),
            List.of(), List.of(), "Approve the SRS", observations));

        var saved = run(first);
        assertThat(saved.status()).isEqualTo("COMPLETED");
        assertThat(saved.report().verifiedChecks()).containsExactlyElementsOf(observations);
        assertThat(saved.report().summary()).contains("No actionable concerns", "not a confirmation")
            .doesNotContain("Everything is perfect");
        assertThat(saved.report().suggestedAction()).contains("independently assess remaining requirements")
            .doesNotContain("Approve the SRS");
        assertThat(run(second).reused()).isTrue();
        assertThat(service.saved(workspace, second.getId(), "admin").report().verifiedChecks()).hasSize(2);
        verify(provider, times(1)).review(any());
    }

    @Test void aSingleOrInventedPositiveCheckDoesNotBecomeEvidenceOfAnOverallCleanPass() {
        when(pdf.inspect(any())).thenReturn(new PdfInspection(true, false, 84, 1000,
            "Trevora stores vehicle service records and rejects duplicate entries.", ""));
        var actual = new AiReviewProvider.VerifiedCheck("Service records described",
            AiReviewProvider.FindingSource.DOCUMENT,
            "Trevora stores vehicle service records and rejects duplicate entries", "");
        var unverified = new AiReviewProvider.VerifiedCheck("Every requirement satisfied",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
            "An invented passage that is not found in the PDF", "Missing template quote");
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result("All good", List.of(),
            List.of(), List.of(), "Approve it", List.of(actual, unverified)));

        var uncertain = run(first);
        assertThat(uncertain.status()).isEqualTo("UNCERTAIN");
        assertThat(uncertain.failureCode()).isEqualTo("INSUFFICIENT_REVIEW_EVIDENCE");
        assertThat(uncertain.report()).isNull();
        assertThat(uncertain.message()).contains("inconclusive");
    }

    @Test void onePdfExcerptCannotBeCountedTwiceToManufactureACompletePositiveReview() {
        when(pdf.inspect(any())).thenReturn(new PdfInspection(true, false, 84, 1000,
            "Trevora stores vehicle service records and rejects duplicate entries.", ""));
        var firstCheck = new AiReviewProvider.VerifiedCheck("Records are described",
            AiReviewProvider.FindingSource.DOCUMENT,
            "Trevora stores vehicle service records and rejects duplicate entries", "");
        var secondCheck = new AiReviewProvider.VerifiedCheck("Everything is compliant",
            AiReviewProvider.FindingSource.DOCUMENT,
            "Trevora stores vehicle service records and rejects duplicate entries", "");
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result("Perfect submission", List.of(),
            List.of(), List.of(), "Approve", List.of(firstCheck, secondCheck)));

        var uncertain = run(first);
        assertThat(uncertain.status()).isEqualTo("UNCERTAIN");
        assertThat(uncertain.failureCode()).isEqualTo("INSUFFICIENT_REVIEW_EVIDENCE");
        assertThat(uncertain.report()).isNull();
    }

    @Test void aGroundingFilterThatRemovesAllProposedFindingsReportsInconclusiveRatherThanSuccess() {
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result(
            "Project Scope is missing", List.of(),
            List.of(new AiReviewProvider.MissingRequiredSection("Project Scope",
                AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS, "Check requirements")),
            List.of(), "Add Project Scope"));

        var inconclusive = run(first);
        assertThat(inconclusive.status()).isEqualTo("UNCERTAIN");
        assertThat(inconclusive.failureCode()).isEqualTo("FINDINGS_FILTERED");
        assertThat(inconclusive.report()).isNull();
        assertThat(jdbc.queryForObject("SELECT report_json FROM ai_review_jobs", String.class)).isNull();
    }

    @Test void rerunKeepsPreviousSubstantiveReportWhileRunningAndAfterAnInconclusiveAttempt() {
        assertThat(run(first).status()).isEqualTo("COMPLETED");
        var original = service.saved(workspace, first.getId(), "admin");
        var tasks = new java.util.ArrayList<Runnable>();
        service = newService(store, tasks::add);
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result("No issues", List.of(),
            List.of(), List.of(), "No action"));

        var running = service.review(workspace, first.getId(), null, "admin", false, null, true);
        assertThat(running.status()).isEqualTo("RUNNING");
        assertThat(running.report()).isNull();
        assertThat(running.previousReport()).isEqualTo(original.report());
        assertThat(running.previousGeneratedAt()).isEqualTo(original.generatedAt());
        assertThat(service.saved(workspace, second.getId(), "admin").status()).isEqualTo("NOT_REVIEWED");
        tasks.get(0).run();

        var failed = service.saved(workspace, first.getId(), "admin");
        assertThat(failed.status()).isEqualTo("UNCERTAIN");
        assertThat(failed.failureCode()).isEqualTo("NO_GROUNDED_FINDINGS");
        assertThat(failed.report()).isNull();
        assertThat(failed.previousReport()).isEqualTo(original.report());
        assertThat(failed.previousGeneratedAt()).isEqualTo(original.generatedAt());
        assertThat(jdbc.queryForObject("SELECT report_json FROM ai_review_jobs", String.class))
            .contains("document-level issue");

        when(provider.review(any())).thenReturn(result);
        var recovered = service.review(workspace, first.getId(), "admin", true, failed.retryToken());
        assertThat(recovered.status()).isEqualTo("RUNNING");
        assertThat(recovered.previousReport()).isEqualTo(original.report());
        tasks.get(1).run();
        var saved = service.saved(workspace, first.getId(), "admin");
        assertThat(saved.status()).isEqualTo("COMPLETED");
        assertThat(saved.previousReport()).isNull();
        assertThat(saved.report()).isEqualTo(original.report());
        verify(provider, times(3)).review(any());
    }

    @Test void migrationReclassifiesLegacyGenericSuccessButPreservesSubstantiveSavedReviews() {
        assertThat(run(first).status()).isEqualTo("COMPLETED");
        var substantive = service.saved(workspace, first.getId(), "admin");
        var anotherTeam = response("legacy-generic", "another-team");
        var generic = new AiReviewProvider.Result("No issues", List.of(), List.of(), List.of(), "No action");
        var input = service.review(workspace, anotherTeam.getId(), "admin", false);
        assertThat(input.status()).isEqualTo("COMPLETED");
        String empty = new ObjectMapper().valueToTree(generic).toString().replace("No issues",
            "The AI review returned no grounded findings from the submitted PDF or supplied requirement sources.");
        jdbc.update("UPDATE ai_review_jobs SET report_json = ? WHERE cache_key = ?", empty,
            jdbc.queryForObject("SELECT cache_key FROM ai_review_response_links WHERE response_id = ?", String.class, anotherTeam.getId()));

        new ResourceDatabasePopulator(new ClassPathResource(
            "db/migration/V31__mark_empty_ai_reviews_inconclusive.sql")).execute(datasource);
        var migrated = service.saved(workspace, anotherTeam.getId(), "admin");
        assertThat(migrated.status()).isEqualTo("UNCERTAIN");
        assertThat(migrated.failureCode()).isEqualTo("NO_GROUNDED_FINDINGS");
        assertThat(migrated.previousReport()).isNull();
        assertThat(migrated.retryToken()).isNotNull();
        assertThat(service.saved(workspace, first.getId(), "admin").report()).isEqualTo(substantive.report());
    }

    @Test void previousValidReportSurvivesProviderErrorWithoutBeingMislabelledAsCurrent() {
        assertThat(run(first).status()).isEqualTo("COMPLETED");
        var original = service.saved(workspace, first.getId(), "admin");
        when(provider.review(any())).thenThrow(new IllegalStateException("network failure"));
        var failed = service.review(workspace, first.getId(), null, "admin", false, null, true);
        assertThat(failed.status()).isEqualTo("UNCERTAIN");
        assertThat(failed.report()).isNull();
        assertThat(failed.previousReport()).isEqualTo(original.report());
        assertThat(failed.previousGeneratedAt()).isEqualTo(original.generatedAt());
    }

    @Test void twoConcurrentRerunRequestsForOneSharedFileDoNotStartTwoGeminiJobs() {
        assertThat(run(first).status()).isEqualTo("COMPLETED");
        var tasks = new java.util.ArrayList<Runnable>();
        service = newService(store, tasks::add);
        var started = service.review(workspace, first.getId(), null, "admin", false, null, true);
        assertThat(started.status()).isEqualTo("RUNNING");
        var duplicate = service.review(workspace, second.getId(), null, "admin", false, null, true);
        assertThat(duplicate.status()).isEqualTo("RUNNING");
        assertThat(duplicate.reused()).isTrue();
        assertThat(tasks).hasSize(1);
        tasks.get(0).run();
        assertThat(service.saved(workspace, first.getId(), "admin").status()).isEqualTo("COMPLETED");
        assertThat(service.saved(workspace, second.getId(), "admin").status()).isEqualTo("COMPLETED");
        verify(provider, times(2)).review(any());
    }

    @Test void ordinaryRunAfterCompletionReusesSavedReportWithoutBillingGeminiAgain() {
        run(first);
        run(second);
        assertThat(service.review(workspace, second.getId(), null, "admin", false, null, false).reused()).isTrue();
        verify(provider, times(1)).review(any());
        assertThatThrownBy(() -> service.review(workspace, second.getId(), null, "admin", true,
            UUID.randomUUID(), true)).isInstanceOf(IllegalArgumentException.class);
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
        when(templates.find(eq(workspace), eq("SRS"), anyString())).thenReturn(template);
        assertThat(run(first).reused()).isFalse();
        when(provider.cacheVersion()).thenReturn("fake-provider:model-2:temperature-0");
        assertThat(run(first).reused()).isFalse();
        verify(provider, times(5)).review(any());
    }

    @Test void wrongDocumentEvidenceRemainsAllowedWithoutInstructionsOrOfficialTemplate() {
        deliverable.setInstructions("");
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result(
            "Project Scope and Schedule are mandatory SPMP sections and are missing.",
            List.of(new AiReviewProvider.Finding(
                "The submitted PDF identifies itself as an Individual Problem Exploration report.",
                AiReviewProvider.FindingSource.DOCUMENT,
                "Page 1: Part A: Individual Problem Exploration",
                "")),
            List.of(), List.of(), "Add Project Scope, Schedule, and Resource Planning before approval."));

        var completed = run(first);

        assertThat(completed.status()).isEqualTo("COMPLETED");
        assertThat(completed.report().findings()).extracting(AiReviewProvider.Finding::source)
            .containsExactly(AiReviewProvider.FindingSource.DOCUMENT);
        assertThat(completed.report().missingRequiredSections()).isEmpty();
        assertThat(completed.report().summary()).contains("Document evidence:", "Individual Problem Exploration")
            .doesNotContain("Project Scope", "Schedule", "mandatory SPMP");
        assertThat(completed.report().suggestedAction()).contains("Verify that the submitted PDF is the intended deliverable")
            .doesNotContain("Project Scope", "Schedule", "Resource Planning");
        assertThat(completed.report().limitations()).containsExactly(
            "No official template was supplied, so compliance with a specific template structure was not assessed.",
            "No deliverable Instructions were supplied, so requirement compliance is limited to the requested deliverable identity and document evidence.");
    }

    @Test void genericInstructionsCannotAuthorizeAnInventedMissingSpmpSection() {
        deliverable.setInstructions("Submit the final Refactored SPMP PDF.");
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result(
            "Project Scope is missing.", List.of(),
            List.of(new AiReviewProvider.MissingRequiredSection("Project Scope",
                AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
                "Submit the final Refactored SPMP PDF.")),
            List.of(), "Add Project Scope."));

        var guarded = run(first);

        assertThat(guarded.status()).isEqualTo("UNCERTAIN");
        assertThat(guarded.failureCode()).isEqualTo("FINDINGS_FILTERED");
        assertThat(guarded.report()).isNull();
    }

    @Test void explicitlyNamedInstructionCanAuthorizeAMissingRequiredSection() {
        deliverable.setInstructions("Include a Project Scope section and a Risk Management section.");
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result(
            "The supplied Instructions require Project Scope, which was not found.", List.of(),
            List.of(new AiReviewProvider.MissingRequiredSection("Project Scope",
                AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
                "Include a Project Scope section and a Risk Management section.")),
            List.of(), "Ask the team to add the explicitly required Project Scope section."));

        var completed = run(first);

        assertThat(completed.status()).isEqualTo("COMPLETED");
        assertThat(completed.report().missingRequiredSections()).extracting(AiReviewProvider.MissingRequiredSection::section)
            .containsExactly("Project Scope");
    }

    @Test void providerMissingSectionClaimIsRemovedWhenTheSubmittedBodyContainsThatSection() {
        deliverable.setInstructions("Include a 2.4 Constraints section.");
        when(pdf.inspect(any())).thenReturn(new PdfInspection(true, false, 4, 500, """
            1. Introduction
            Project context.
            2.4. Constraints
            The system requires internet access and role-based authentication.
            """, ""));
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result(
            "The Constraints section is missing.", List.of(),
            List.of(new AiReviewProvider.MissingRequiredSection("2.4 Constraints",
                AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
                "Include a 2.4 Constraints section.")),
            List.of(), "Add the Constraints section."));

        var completed = run(first);

        assertThat(completed.status()).isEqualTo("UNCERTAIN");
        assertThat(completed.failureCode()).isEqualTo("FINDINGS_FILTERED");
        assertThat(completed.report()).isNull();
    }

    @Test void twoPdfArtifactsInOneResponseKeepIndependentSavedLinksAndReviews() {
        var framework = new DeliverableField("framework-field", deliverableId, "frameworkModel", "Framework / Model",
            DeliverableFieldType.DRIVE_PDF, true, 0, DocumentCheckPolicy.MANUAL, true, true);
        var highlights = new DeliverableField("highlights-field", deliverableId, "validationHighlights", "MVP Validation Highlights",
            DeliverableFieldType.DRIVE_PDF, true, 1, DocumentCheckPolicy.MANUAL, true, true);
        when(fields.findAllByDeliverableIdAndActiveTrueOrderByDisplayOrderAscLabelAsc(deliverableId))
            .thenReturn(List.of(framework, highlights));
        var response = responseWithValues("multi-field", "team-mvp", """
            {"frameworkModel":"https://drive.google.com/file/d/framework-file/view",
             "validationHighlights":"https://drive.google.com/file/d/highlights-file/view"}
            """);
        files.put("framework-file", "%PDF-framework-content".getBytes(StandardCharsets.UTF_8));
        files.put("highlights-file", "%PDF-highlights-content".getBytes(StandardCharsets.UTF_8));

        assertThat(service.review(workspace, response.getId(), "framework-field", "admin", false, null).status()).isEqualTo("COMPLETED");
        assertThat(service.review(workspace, response.getId(), "highlights-field", "admin", false, null).status()).isEqualTo("COMPLETED");

        var frameworkSaved = service.saved(workspace, response.getId(), "framework-field", "admin");
        var highlightsSaved = service.saved(workspace, response.getId(), "highlights-field", "admin");
        assertThat(frameworkSaved.status()).isEqualTo("COMPLETED");
        assertThat(highlightsSaved.status()).isEqualTo("COMPLETED");
        assertThat(frameworkSaved.fieldId()).isEqualTo("framework-field");
        assertThat(highlightsSaved.fieldId()).isEqualTo("highlights-field");
        assertThat(frameworkSaved.sourceUrl()).contains("framework-file");
        assertThat(highlightsSaved.sourceUrl()).contains("highlights-file");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_field_links WHERE response_id = ?", Integer.class, response.getId())).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_jobs", Integer.class)).isEqualTo(2);
    }

    @Test void fieldScopedRerunUpdatesSamePdfForEveryTeamMemberWithoutOverwritingAnotherArtifact() {
        var framework = new DeliverableField("framework-field", deliverableId, "frameworkModel", "Framework / Model",
            DeliverableFieldType.DRIVE_PDF, true, 0, DocumentCheckPolicy.AUTO, true, true);
        var highlights = new DeliverableField("highlights-field", deliverableId, "validationHighlights", "MVP Validation Highlights",
            DeliverableFieldType.DRIVE_PDF, true, 1, DocumentCheckPolicy.AUTO, true, true);
        when(fields.findAllByDeliverableIdAndActiveTrueOrderByDisplayOrderAscLabelAsc(deliverableId))
            .thenReturn(List.of(framework, highlights));
        String submitted = """
            {"frameworkModel":"https://drive.google.com/file/d/framework-file/view",
             "validationHighlights":"https://drive.google.com/file/d/highlights-file/view"}
            """;
        var studentOne = responseWithValues("member-one", "team-shared", submitted);
        var studentTwo = responseWithValues("member-two", "team-shared", submitted);
        files.put("framework-file", "%PDF-shared-framework".getBytes(StandardCharsets.UTF_8));
        files.put("highlights-file", "%PDF-shared-highlights".getBytes(StandardCharsets.UTF_8));

        assertThat(service.review(workspace, studentOne.getId(), "framework-field", "admin", false, null).status())
            .isEqualTo("COMPLETED");
        assertThat(service.review(workspace, studentTwo.getId(), "framework-field", "admin", false, null).reused())
            .isTrue();
        var independent = service.review(workspace, studentOne.getId(), "highlights-field", "admin", false, null);
        assertThat(independent.status()).isEqualTo("COMPLETED");
        var formerSummary = service.saved(workspace, studentOne.getId(), "framework-field", "admin").report().summary();

        var updated = new AiReviewProvider.Result("New Gemini review",
            List.of(new AiReviewProvider.Finding("A new artifact-level observation appears.",
                AiReviewProvider.FindingSource.DOCUMENT, "Page 1", "")),
            List.of(), List.of(), "Inspect the new observation.");
        when(provider.review(any())).thenReturn(updated);
        var rerun = service.review(workspace, studentOne.getId(), "framework-field", "admin", false, null, true);
        assertThat(rerun.status()).isEqualTo("COMPLETED");
        assertThat(rerun.report().summary()).contains("new artifact-level observation");
        assertThat(rerun.report().summary()).isNotEqualTo(formerSummary);
        assertThat(service.saved(workspace, studentTwo.getId(), "framework-field", "admin")
            .report().summary()).isEqualTo(rerun.report().summary());
        assertThat(service.saved(workspace, studentOne.getId(), "highlights-field", "admin")
            .report().summary()).isEqualTo(independent.report().summary());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_jobs", Integer.class)).isEqualTo(2);
        verify(provider, times(3)).review(any());
    }

    @Test void multiPdfResponseRequiresExplicitArtifactInsteadOfReviewingTheFirstPdf() {
        var framework = new DeliverableField("framework-field", deliverableId, "frameworkModel", "Framework / Model",
            DeliverableFieldType.DRIVE_PDF, true, 0, DocumentCheckPolicy.MANUAL, true, true);
        var highlights = new DeliverableField("highlights-field", deliverableId, "validationHighlights", "MVP Validation Highlights",
            DeliverableFieldType.DRIVE_PDF, true, 1, DocumentCheckPolicy.MANUAL, true, true);
        when(fields.findAllByDeliverableIdAndActiveTrueOrderByDisplayOrderAscLabelAsc(deliverableId))
            .thenReturn(List.of(framework, highlights));
        var response = responseWithValues("multi-ambiguous", "team-mvp", """
            {"validationInstrument":"https://docs.google.com/forms/d/e/form/viewform",
             "frameworkModel":"https://drive.google.com/file/d/framework-file/view",
             "validationHighlights":"https://drive.google.com/file/d/highlights-file/view"}
            """);

        assertThatThrownBy(() -> service.review(workspace, response.getId(), null, "admin", false, null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Choose which PDF artifact");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ai_review_jobs", Integer.class)).isZero();
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

    private FormResponse responseWithValues(String subject, String team, String valuesJson) {
        var response = new FormResponse(UUID.randomUUID(), workspace, deliverableId, subject, subject + "@example.com", UUID.randomUUID(), subject,
            "Student", team, valuesJson, Instant.now(), Instant.now());
        when(responses.findById(response.getId())).thenReturn(Optional.of(response));
        jdbc.update("INSERT INTO form_responses VALUES (?)", response.getId());
        return response;
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
