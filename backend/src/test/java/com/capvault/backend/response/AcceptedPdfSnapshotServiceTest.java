package com.capvault.backend.response;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.filecheck.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class AcceptedPdfSnapshotServiceTest {
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
    private final FileCheckReportRepository reports = mock(FileCheckReportRepository.class);
    private final AcceptedPdfSnapshotService service = new AcceptedPdfSnapshotService(fields, reports, json);
    private final UUID workspace = UUID.randomUUID(), responseId = UUID.randomUUID(), deliverable = UUID.randomUUID();
    private final Instant updated = Instant.parse("2026-10-28T01:02:03Z");
    private final String source = "https://drive.google.com/file/d/FILE123/view?resourcekey=key123";
    private FormResponse response(String values) { return new FormResponse(responseId, workspace, deliverable, "subject", "a@test", UUID.randomUUID(), "1", "Name", "T", values, updated, updated); }
    private DeliverableField field(String id, String key, boolean required) {
        return new DeliverableField(id, deliverable, key, key, DeliverableFieldType.DRIVE_PDF, required, 0, DocumentCheckPolicy.OFF, false, true);
    }
    private FileCheckReport report(String field, String responseVersion, String url, String status, boolean readable) throws Exception {
        var metadata = new FileCheckResponse.DriveMetadata("FILE123", "source.pdf", "application/pdf", 42L,
            "1234567890abcdef1234567890abcdef", OffsetDateTime.parse("2026-10-27T00:00:00Z"), true, url);
        var check = new FileCheckResponse(null, responseId.toString(), field, url, responseVersion, status, false, "", List.of(), List.of(), List.of(), "", metadata,
            new FileCheckResponse.DocumentResult(readable, false, 1, 1), null, "checker", LocalDateTime.parse("2026-10-28T01:01:00"));
        var report = mock(FileCheckReport.class); when(report.getReportJson()).thenReturn(json.writeValueAsString(check)); when(report.getSourceUrl()).thenReturn(url); return report;
    }
    @Test void pinsAllRequiredAndProvidedOptionalFields() throws Exception {
        var a = field("field-a", "one", true); var b = field("field-b", "two", false);
        var proofA = report("field-a", updated.toString(), source, "COMPLETED", true);
        var proofB = report("field-b", updated.toString(), source, "COMPLETED", true);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable)).thenReturn(List.of(a, b));
        when(reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(workspace, responseId.toString(), "field-a"))
            .thenReturn(Optional.of(proofA));
        when(reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(workspace, responseId.toString(), "field-b"))
            .thenReturn(Optional.of(proofB));
        var manifest = service.read(service.capture(response(json.writeValueAsString(java.util.Map.of("one", source, "two", source)))));
        assertThat(manifest.complete()).isTrue();
        assertThat(manifest.artifacts()).hasSize(2);
        assertThat(manifest.artifacts().getFirst().resourceKey()).isEqualTo("key123");
        assertThat(manifest.artifacts().getFirst().size()).isEqualTo(42);
    }
    @Test void staleFailedMissingAndAmbiguousLegacyEvidenceAreIncomplete() throws Exception {
        var a = field("field-a", "one", true); var b = field("field-b", "two", false);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable)).thenReturn(List.of(a, b));
        var request = response(json.writeValueAsString(java.util.Map.of("one", source)));
        var stale = report("field-a", updated.minusSeconds(1).toString(), source, "COMPLETED", true);
        var failed = report("field-a", updated.toString(), source, "BLOCKED", true);
        var unreadable = report("field-a", updated.toString(), source, "COMPLETED", false);
        when(reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(workspace, responseId.toString(), "field-a"))
            .thenReturn(Optional.of(stale), Optional.of(failed), Optional.of(unreadable), Optional.empty());
        for (int i = 0; i < 4; i++) assertThat(service.read(service.capture(request)).complete()).isFalse();
        verify(reports, never()).findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdIsNullOrderByCheckedAtDesc(any(), any());
        assertThat(service.read(null).complete()).isFalse();
        assertThat(service.read("{\"complete\":true,\"artifacts\":[]}").complete()).isFalse();
    }
    @Test void singleFieldLegacyEvidenceWorksOnlyWhenMatching() throws Exception {
        var valid = report(null, updated.toString(), source, "COMPLETED", true);
        var wrong = report(null, updated.toString(), "https://drive.google.com/file/d/OTHER/view", "COMPLETED", true);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable)).thenReturn(List.of(field("field-a", "one", true)));
        when(reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(workspace, responseId.toString(), "field-a")).thenReturn(Optional.empty());
        when(reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdIsNullOrderByCheckedAtDesc(workspace, responseId.toString()))
            .thenReturn(Optional.of(valid), Optional.of(wrong));
        var request = response(json.writeValueAsString(java.util.Map.of("one", source)));
        assertThat(service.read(service.capture(request)).complete()).isTrue();
        assertThat(service.read(service.capture(request)).complete()).isFalse();
    }
    @Test void everyAcceptancePinsFreshManifestUnderResponseLock() {
        var responseRepo = mock(FormResponseRepository.class);
        var acceptanceRepo = mock(ResponseAcceptanceRepository.class);
        var snapshots = mock(AcceptedPdfSnapshotService.class);
        var response = response("{}");
        when(responseRepo.findByIdForUpdate(responseId)).thenReturn(Optional.of(response));
        when(acceptanceRepo.findByResponseId(responseId)).thenReturn(Optional.empty());
        when(acceptanceRepo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(snapshots.capture(response)).thenReturn("first", "second");
        var review = new ReviewFeedbackService(responseRepo, mock(ResponseFeedbackRepository.class), acceptanceRepo,
            mock(com.capvault.backend.staff.AdviserTeamAssignmentRepository.class), java.time.Clock.systemUTC(),
            mock(DomainEventRecorder.class), mock(CanonicalResponseService.class), snapshots);
        var accepted = review.accept(responseId, "admin", "admin@test", "ADMIN");
        assertThat(accepted.getSourceArtifactsJson()).isEqualTo("first");
        when(acceptanceRepo.findByResponseId(responseId)).thenReturn(Optional.of(accepted));
        assertThat(review.accept(responseId, "admin", "admin@test", "ADMIN").getSourceArtifactsJson()).isEqualTo("second");
        verify(responseRepo, times(2)).findByIdForUpdate(responseId);
    }
}
