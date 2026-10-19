package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.drive.GoogleDriveProperties;
import com.capvault.backend.drive.GoogleDriveUnavailableException;
import com.capvault.backend.filecheck.PdfInspection;
import com.capvault.backend.filecheck.PdfInspector;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.response.ReviewFeedbackService;
import com.capvault.backend.staff.StaffAccessResolver;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.template.DocumentTemplateService;
import com.capvault.backend.template.DocumentTemplateText;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

@ExtendWith(OutputCaptureExtension.class)
class AiReviewVerifiedSnapshotTest {
    private static final UUID WORKSPACE = UUID.randomUUID();
    private static final UUID DELIVERABLE_ID = UUID.randomUUID();
    private static final Instant CAPTURED_AT = Instant.now();
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final DeliverableRepository deliverables = mock(DeliverableRepository.class);
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
    private final DocumentTemplateService templates = mock(DocumentTemplateService.class);
    private final GoogleDriveGateway drive = mock(GoogleDriveGateway.class);
    private final PdfInspector pdf = mock(PdfInspector.class);
    private final ReviewFeedbackService access = mock(ReviewFeedbackService.class);
    private final StaffAccessResolver roles = mock(StaffAccessResolver.class);
    private final AiReviewProvider provider = mock(AiReviewProvider.class);
    private JdbcTemplate jdbc;
    private AiReviewStore store;
    private AiReviewService service;
    private FormResponse response;
    private byte[] bytes;
    private DriveFileMetadata metadata;

    @BeforeEach void setup() throws Exception {
        var dataSource = new DriverManagerDataSource("jdbc:h2:mem:snapshot_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE academic_workspaces(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE academic_deliverables(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE form_responses(id UUID PRIMARY KEY)");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V18__deduplicated_ai_reviews.sql"),
            new ClassPathResource("db/migration/V33__ai_review_attempt_history.sql")).execute(dataSource);
        jdbc.execute("CREATE TABLE ai_review_field_links(response_id UUID NOT NULL REFERENCES form_responses(id), field_id VARCHAR(80) NOT NULL, source_value_sha256 VARCHAR(64) NOT NULL, cache_key VARCHAR(64) NOT NULL REFERENCES ai_review_jobs(cache_key), PRIMARY KEY(response_id, field_id))");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V37__ai_review_source_verification_time.sql"),
            new ClassPathResource("db/migration/V39__durable_ai_review_failure_diagnostics.sql")).execute(dataSource);
        jdbc.update("INSERT INTO academic_workspaces VALUES (?)", WORKSPACE);
        jdbc.update("INSERT INTO academic_deliverables VALUES (?)", DELIVERABLE_ID);
        store = new AiReviewStore(jdbc, new DataSourceTransactionManager(dataSource), Clock.fixed(CAPTURED_AT, ZoneOffset.UTC));
        service = new AiReviewService(provider, store, responses, deliverables, fields, templates, drive,
            new GoogleDriveProperties(true, "", 25_000_000), pdf, access, roles, new ObjectMapper(), Runnable::run);
        var deliverable = new Deliverable(WORKSPACE, "SRS", "Requirements", "srs", "Check requirements", LocalDateTime.now(), true, DeliverableStatus.PUBLISHED);
        ReflectionTestUtils.setField(deliverable, "id", DELIVERABLE_ID);
        when(deliverables.findById(DELIVERABLE_ID)).thenReturn(Optional.of(deliverable));
        when(roles.activeRolesFor("admin")).thenReturn(Set.of(StaffRole.ADMIN));
        when(provider.isConfigured()).thenReturn(true);
        when(provider.cacheVersion()).thenReturn("fake-provider:model-1");
        when(provider.review(any())).thenReturn(new AiReviewProvider.Result("Grounded", List.of(), List.of(), List.of(), "Review."));
        when(drive.isConfigured()).thenReturn(true);
        when(templates.findText(any(), any(), any())).thenReturn(null);
        bytes = "%PDF-verified-snapshot".getBytes(StandardCharsets.UTF_8);
        metadata = metadata(bytes, "same");
        when(drive.getMetadata(any())).thenReturn(metadata);
        when(drive.download(any())).thenReturn(bytes);
        when(pdf.inspect(any())).thenReturn(new PdfInspection(true, false, 1, 1, 20, "PDF text", null));
        response = new FormResponse(UUID.randomUUID(), WORKSPACE, DELIVERABLE_ID, "file-1", "student@example.com",
            UUID.randomUUID(), "student", "Student", "team-one",
            "{\"documentPdf\":\"https://drive.google.com/file/d/file-1/view\"}", CAPTURED_AT, CAPTURED_AT);
        when(responses.findById(response.getId())).thenReturn(Optional.of(response));
        jdbc.update("INSERT INTO form_responses VALUES (?)", response.getId());
    }

    @Test void previewThenPlannedUsesOneDownloadAndFreshMetadataAroundReuseAndRetainsCaptureTime() {
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        service.reviewPlanned(WORKSPACE, response.getId(), plan.fieldId(), "admin", false, null, false, plan.key(), null);

        verify(drive, times(1)).download(any());
        verify(drive, times(4)).getMetadata(any());
        var input = org.mockito.ArgumentCaptor.forClass(AiReviewProvider.Input.class);
        verify(provider).review(input.capture());
        assertThat(input.getValue().pdf()).containsExactly(bytes);
        assertThat(store.linkedFor(List.of(response.getId())).get(response.getId()).sourceVerifiedAt().toEpochMilli())
            .isEqualTo(CAPTURED_AT.toEpochMilli());
    }

    @Test void plannedKeyOrContextMismatchBlocksProviderAfterSnapshotReuse() {
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        when(templates.findText(any(), any(), any())).thenReturn(new DocumentTemplateText("changed", "changed-hash"));
        assertThatThrownBy(() -> service.reviewPlanned(WORKSPACE, response.getId(), plan.fieldId(), "admin", false, null,
            false, plan.key(), null)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("changed after preparation");
        verify(provider, never()).review(any());
        verify(drive, times(1)).download(any());
    }

    @Test void plannedMetadataAccessFailureIsStillSurfacedAfterAValidPreview() {
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        doReturn(metadata).doThrow(new GoogleDriveUnavailableException("private", new HttpClientErrorException(HttpStatus.FORBIDDEN),
            GoogleDriveUnavailableException.Kind.FILE_ACCESS)).when(drive).getMetadata(any());
        assertThatThrownBy(() -> service.reviewPlanned(WORKSPACE, response.getId(), plan.fieldId(), "admin", false, null,
            false, plan.key(), null)).isInstanceOf(AiReviewService.DrivePreparationFailure.class)
            .satisfies(error -> assertThat(((AiReviewService.DrivePreparationFailure) error).getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY));
        verify(provider, never()).review(any());
    }

    @Test void firstPlannedMetadataAccessFailureIsNotMaskedByTheSnapshot() {
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        doThrow(new GoogleDriveUnavailableException("private", new HttpClientErrorException(HttpStatus.FORBIDDEN),
            GoogleDriveUnavailableException.Kind.FILE_ACCESS)).when(drive).getMetadata(any());
        assertThatThrownBy(() -> service.reviewPlanned(WORKSPACE, response.getId(), plan.fieldId(), "admin", false, null,
            false, plan.key(), null)).isInstanceOf(AiReviewService.DrivePreparationFailure.class);
        verify(provider, never()).review(any());
    }

    @Test void cacheHitWithChangedPdfEligibilityOrVersionNeverCallsProvider() {
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        var inaccessible = new DriveFileMetadata("file-1", "document.pdf", "application/pdf", (long) bytes.length,
            metadata.md5Checksum(), metadata.modifiedTime(), false, "");
        doReturn(metadata).doReturn(inaccessible).when(drive).getMetadata(any());
        assertThatThrownBy(() -> service.reviewPlanned(WORKSPACE, response.getId(), plan.fieldId(), "admin", false, null,
            false, plan.key(), null)).isInstanceOf(ResponseStatusException.class);
        verify(provider, never()).review(any());
    }

    @Test void versionChangeDownloadsFreshAndRejectsTheOldPlannedKey() throws Exception {
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        bytes = "%PDF-new-version".getBytes(StandardCharsets.UTF_8);
        metadata = metadata(bytes, "new");
        when(drive.getMetadata(any())).thenReturn(metadata);
        when(drive.download(any())).thenReturn(bytes);
        assertThatThrownBy(() -> service.reviewPlanned(WORKSPACE, response.getId(), plan.fieldId(), "admin", false, null,
            false, plan.key(), null)).isInstanceOf(ResponseStatusException.class).hasMessageContaining("changed after preparation");
        verify(drive, times(2)).download(any());
        verify(provider, never()).review(any());
    }

    @Test void unknownMd5KeepsFreshDownloadBehaviorWithoutCaching() {
        metadata = new DriveFileMetadata("file-1", "document.pdf", "application/pdf", (long) bytes.length, null,
            metadata.modifiedTime(), true, "");
        when(drive.getMetadata(any())).thenReturn(metadata);
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        service.reviewPlanned(WORKSPACE, response.getId(), plan.fieldId(), "admin", false, null, false, plan.key(), null);
        verify(drive, times(2)).download(any());
        verify(drive, times(4)).getMetadata(any());
    }

    @Test void actualMd5MismatchKeepsFreshDownloadBehaviorWithoutCaching() throws Exception {
        metadata = new DriveFileMetadata("file-1", "document.pdf", "application/pdf", (long) bytes.length,
            java.util.HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest("wrong".getBytes(StandardCharsets.UTF_8))),
            metadata.modifiedTime(), true, "");
        when(drive.getMetadata(any())).thenReturn(metadata);
        var plan = service.preview(WORKSPACE, response.getId(), null, "admin");
        service.preview(WORKSPACE, response.getId(), plan.fieldId(), "admin");
        verify(drive, times(2)).download(any());
    }

    private static DriveFileMetadata metadata(byte[] bytes, String marker) throws Exception {
        String md5 = java.util.HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(bytes));
        return new DriveFileMetadata("file-1", "document.pdf", "application/pdf", (long) bytes.length, md5,
            OffsetDateTime.parse("2026-10-19T00:00:00Z").plusSeconds(marker.equals("new") ? 1 : 0), true, "");
    }
}
