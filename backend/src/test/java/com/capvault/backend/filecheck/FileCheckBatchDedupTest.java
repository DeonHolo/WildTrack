package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

/** No network: verifies one provider capture and distinct checked response associations. */
class FileCheckBatchDedupTest {
    private final FileCheckService service = mock(FileCheckService.class);
    private final GoogleDriveGateway drive = mock(GoogleDriveGateway.class);
    private final StudentAssociationSecurity security = mock(StudentAssociationSecurity.class);
    private final StaffManagementService staff = mock(StaffManagementService.class);
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final FileCheckController controller = new FileCheckController(service, drive, security, staff, responses);
    private final HttpServletRequest request = mock(HttpServletRequest.class);
    private final UUID workspaceId = UUID.randomUUID();

    private void retainValidatedRequests() {
        when(service.validateBatchTarget(eq(workspaceId), any(FileCheckRequest.class)))
            .thenAnswer(call -> call.getArgument(1));
    }

    @Test
    void sameDriveFileAcrossFiveResponsesSharesSingleProviderCaptureAndPreservesIndividualReports() {
        retainValidatedRequests();
        when(security.requireSession(request)).thenReturn(new StoredWildTrackSession(
            "test-hash", "staff-subject", "staff@example.invalid", Instant.now(), Instant.now().plusSeconds(120)));
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADMIN));
        String url = "https://drive.google.com/file/d/same-file-id/view";
        List<FileCheckRequest> checks = IntStream.range(0, 5).mapToObj(index -> {
            UUID responseId = UUID.randomUUID();
            var response = new FormResponse(responseId, workspaceId, UUID.randomUUID(),
                "student-subject-" + index, "fake" + index + "@example.invalid", UUID.randomUUID(),
                "99-9999-99" + index, "Fictional", "team-one", "{\"documentPdf\":\"" + url + "\"}",
                Instant.now(), Instant.now());
            when(responses.findById(responseId)).thenReturn(Optional.of(response));
            return new FileCheckRequest(responseId.toString(), "pdf-field", "SRS", url, Instant.now().toString());
        }).toList();
        var metadata = new DriveFileMetadata("same-file-id", "fake.pdf", "application/pdf", 100L,
            "1234", OffsetDateTime.now(), true, url);
        var captured = new FileCheckService.CapturedPdf(metadata, new byte[] { 1 }, null);
        when(drive.getMetadata(any(DriveFileReference.class))).thenReturn(metadata);
        when(service.capture(any(DriveFileReference.class), eq(metadata))).thenReturn(captured);
        when(service.checkCaptured(eq(workspaceId), any(FileCheckRequest.class), eq(captured)))
            .thenAnswer(call -> {
                FileCheckRequest item = call.getArgument(1);
                return mockResponse(item);
            });

        var result = controller.checkBatch(workspaceId, new FileCheckController.BatchRequest(checks), request);
        assertThat(result).hasSize(5).allSatisfy(item -> {
            assertThat(item.report()).isNotNull();
            assertThat(item.error()).isNull();
            assertThat(item.report().responseId()).isEqualTo(item.responseId());
        });
        verify(drive, times(1)).getMetadata(any(DriveFileReference.class));
        verify(service, times(1)).capture(any(DriveFileReference.class), eq(metadata));
        verify(service, times(5)).checkCaptured(eq(workspaceId), any(FileCheckRequest.class), eq(captured));
    }

    @Test
    void selectsSharedFilesResourceKeyAndGroupsEquivalentLinksIntoOneCapture() {
        retainValidatedRequests();
        admin();
        String fileId = "shared-file";
        List<String> urls = List.of(
            "https://drive.google.com/file/d/shared-file/view",
            "https://drive.google.com/open?id=shared-file&resourcekey=0-validated-key",
            "https://drive.google.com/file/d/shared-file/view?usp=sharing"
        );
        List<FileCheckRequest> checks = IntStream.range(0, urls.size()).mapToObj(index -> {
            var id = UUID.randomUUID();
            when(responses.findById(id)).thenReturn(Optional.of(response(id, workspaceId, "team-one")));
            return new FileCheckRequest(id.toString(), "pdf-field", "SRS", urls.get(index), "client-timestamp");
        }).toList();
        var metadata = metadata(fileId);
        when(drive.getMetadata(any())).thenReturn(metadata);
        var captured = new FileCheckService.CapturedPdf(metadata, new byte[] {1}, null);
        when(service.capture(any(), eq(metadata))).thenReturn(captured);
        when(service.checkCaptured(eq(workspaceId), any(), eq(captured)))
            .thenAnswer(call -> mockResponse(call.getArgument(1)));

        var result = controller.checkBatch(workspaceId, new FileCheckController.BatchRequest(checks), request);

        assertThat(result).hasSize(3).allSatisfy(item -> assertThat(item.report().responseId()).isEqualTo(item.responseId()));
        var reference = org.mockito.ArgumentCaptor.forClass(DriveFileReference.class);
        verify(drive, times(1)).getMetadata(reference.capture());
        assertThat(reference.getValue()).isEqualTo(new DriveFileReference(fileId, "0-validated-key"));
        verify(service, times(1)).capture(eq(reference.getValue()), eq(metadata));
        verify(service, times(3)).checkCaptured(eq(workspaceId), any(), eq(captured));
    }

    @Test
    void rejectsGuestsAndOversizedBatchesBeforeAccessingSubmissionsOrDrive() {
        when(security.requireSession(request)).thenReturn(new StoredWildTrackSession(
            "test-hash", "visitor", "visitor@example.invalid", Instant.now(), Instant.now().plusSeconds(120)));
        when(security.activeRoles(request)).thenReturn(Set.of());
        assertThatThrownBy(() -> controller.checkBatch(workspaceId,
            new FileCheckController.BatchRequest(List.of()), request))
            .isInstanceOf(AccessDeniedException.class);
        admin();
        assertThatThrownBy(() -> controller.checkBatch(workspaceId,
            new FileCheckController.BatchRequest(java.util.Collections.nCopies(401,
                new FileCheckRequest("dummy", "pdf-field", "SRS", "file", "time"))), request))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("at most 400");
        verifyNoInteractions(responses, drive, service);
    }

    @Test
    void abortsEntireBatchOnOtherTeamEvenIfAnAuthorizedSubmissionAppearsFirst() {
        retainValidatedRequests();
        adviser();
        var allowedId = UUID.randomUUID();
        var deniedId = UUID.randomUUID();
        when(responses.findById(allowedId)).thenReturn(Optional.of(response(allowedId, workspaceId, "my-team")));
        when(responses.findById(deniedId)).thenReturn(Optional.of(response(deniedId, workspaceId, "other-team")));
        List<FileCheckRequest> checks = List.of(check(allowedId, "file-one"), check(deniedId, "file-two"));

        assertThatThrownBy(() -> controller.checkBatch(workspaceId,
            new FileCheckController.BatchRequest(checks), request))
            .isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(drive);
        verify(service, never()).checkCaptured(any(), any(), any());
    }

    @Test
    void rejectsForgedSourceOrFieldWithoutFetchingItButProcessesIndependentValidTargets() {
        admin();
        var invalidId = UUID.randomUUID();
        var validId = UUID.randomUUID();
        when(responses.findById(invalidId)).thenReturn(Optional.of(response(invalidId, workspaceId, "team-one")));
        when(responses.findById(validId)).thenReturn(Optional.of(response(validId, workspaceId, "team-one")));
        when(service.validateBatchTarget(eq(workspaceId), any())).thenAnswer(call -> {
            FileCheckRequest item = call.getArgument(1);
            if (item.responseId().equals(invalidId.toString()))
                throw new IllegalArgumentException("Source does not match the saved PDF field.");
            return item;
        });
        var metadata = metadata("file-two");
        var captured = new FileCheckService.CapturedPdf(metadata, new byte[] {1}, null);
        when(drive.getMetadata(any())).thenReturn(metadata);
        when(service.capture(any(), eq(metadata))).thenReturn(captured);
        when(service.checkCaptured(eq(workspaceId), any(), eq(captured)))
            .thenAnswer(call -> mockResponse(call.getArgument(1)));

        var result = controller.checkBatch(workspaceId, new FileCheckController.BatchRequest(
            List.of(check(invalidId, "forged-file"), check(validId, "file-two"))), request);

        assertThat(result).hasSize(2);
        assertThat(result).anySatisfy(item -> {
            assertThat(item.responseId()).isEqualTo(invalidId.toString());
            assertThat(item.report()).isNull();
            assertThat(item.error()).contains("Invalid submitted");
        });
        assertThat(result).anySatisfy(item -> {
            assertThat(item.responseId()).isEqualTo(validId.toString());
            assertThat(item.report().responseId()).isEqualTo(validId.toString());
        });
        verify(drive, times(1)).getMetadata(new DriveFileReference("file-two", null));
        verify(service, never()).checkCaptured(eq(workspaceId), argThat(item -> item.responseId().equals(invalidId.toString())), any());
    }

    @Test
    void rejectsMismatchedMetadataBeforeCaptureAndPersistsOnlyBlockedPerResponseReports() {
        retainValidatedRequests();
        admin();
        var id = UUID.randomUUID();
        when(responses.findById(id)).thenReturn(Optional.of(response(id, workspaceId, "team-one")));
        when(drive.getMetadata(any())).thenReturn(metadata("wrong-file"));
        var blocked = blockedResponse(check(id, "expected-file"));
        when(service.recordBatchProviderFailure(eq(workspaceId), any(), eq(true), any())).thenReturn(blocked);

        var result = controller.checkBatch(workspaceId,
            new FileCheckController.BatchRequest(List.of(check(id, "expected-file"))), request);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).report().status()).isEqualTo("BLOCKED");
        verify(service, never()).capture(any(), any());
        verify(service, never()).checkCaptured(any(), any(), any());
        verify(service).recordBatchProviderFailure(eq(workspaceId), any(), eq(true), any());
    }

    @Test
    void failedMetadataIsolatedToItsFileWhileOtherFileReportsContinue() {
        retainValidatedRequests();
        admin();
        var failedId = UUID.randomUUID();
        var goodId = UUID.randomUUID();
        when(responses.findById(failedId)).thenReturn(Optional.of(response(failedId, workspaceId, "team-one")));
        when(responses.findById(goodId)).thenReturn(Optional.of(response(goodId, workspaceId, "team-one")));
        when(drive.getMetadata(new DriveFileReference("bad-file", null)))
            .thenThrow(new IllegalStateException("raw provider secret key: SECRET-NEVER-EXPOSE"));
        var metadata = metadata("good-file");
        var captured = new FileCheckService.CapturedPdf(metadata, new byte[] {1}, null);
        when(drive.getMetadata(new DriveFileReference("good-file", null))).thenReturn(metadata);
        when(service.capture(any(), eq(metadata))).thenReturn(captured);
        when(service.recordBatchProviderFailure(eq(workspaceId), any(), eq(true), any()))
            .thenAnswer(call -> blockedResponse(call.getArgument(1)));
        when(service.checkCaptured(eq(workspaceId), any(), eq(captured)))
            .thenAnswer(call -> mockResponse(call.getArgument(1)));

        var result = controller.checkBatch(workspaceId, new FileCheckController.BatchRequest(
            List.of(check(failedId, "bad-file"), check(goodId, "good-file"))), request);

        assertThat(result).hasSize(2);
        assertThat(result).anySatisfy(item -> {
            assertThat(item.responseId()).isEqualTo(failedId.toString());
            assertThat(item.report().status()).isEqualTo("BLOCKED");
        });
        assertThat(result).anySatisfy(item -> {
            assertThat(item.responseId()).isEqualTo(goodId.toString());
            assertThat(item.report().status()).isEqualTo("COMPLETED");
        });
        verify(drive, times(2)).getMetadata(any());
        verify(service, times(1)).capture(any(), any());
    }

    @Test
    void adviserCannotBatchInspectAnotherTeamsPdf() {
        retainValidatedRequests();
        when(security.requireSession(request)).thenReturn(new StoredWildTrackSession(
            "test-hash", "staff-subject", "staff@example.invalid", Instant.now(), Instant.now().plusSeconds(120)));
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADVISER));
        when(staff.assignedTeams("staff-subject", workspaceId)).thenReturn(List.of("my-team"));
        UUID responseId = UUID.randomUUID();
        when(responses.findById(responseId)).thenReturn(Optional.of(new FormResponse(responseId,
            workspaceId, UUID.randomUUID(), "some-student", "student@example.invalid", UUID.randomUUID(),
            "99-9999-999", "Fictional", "other-team", "{ }", Instant.now(), Instant.now())));
        var check = new FileCheckRequest(responseId.toString(), "pdf-field", "SRS",
            "https://drive.google.com/file/d/some-file/view", Instant.now().toString());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.checkBatch(
            workspaceId, new FileCheckController.BatchRequest(List.of(check)), request))
            .isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(drive);
    }

    private static FileCheckResponse mockResponse(FileCheckRequest item) {
        return new FileCheckResponse(UUID.randomUUID(), item.responseId(), item.fieldId(),
            item.sourceUrl(), item.sourceResponseUpdatedAt(), "COMPLETED", false, "PDF checked",
            List.of("PDF Verified"), List.of(), List.of(), "Staff review required",
            null, null, TemplateComparison.unavailable(), "Document Check", java.time.LocalDateTime.now());
    }

    private static FileCheckResponse blockedResponse(FileCheckRequest item) {
        return new FileCheckResponse(UUID.randomUUID(), item.responseId(), item.fieldId(), item.sourceUrl(),
            item.sourceResponseUpdatedAt(), "BLOCKED", true, "Drive access unavailable", List.of("Inaccessible"),
            List.of("Inaccessible"), List.of(), "Retry", null, null, TemplateComparison.unavailable(),
            "Document Check", java.time.LocalDateTime.now());
    }

    private static FormResponse response(UUID id, UUID workspaceId, String team) {
        return new FormResponse(id, workspaceId, UUID.randomUUID(), "student", "student@example.invalid",
            UUID.randomUUID(), "99-9999-99", "Fictional", team, "{}", Instant.now(), Instant.now());
    }

    private static DriveFileMetadata metadata(String fileId) {
        return new DriveFileMetadata(fileId, "fake.pdf", "application/pdf", 1L,
            null, OffsetDateTime.now(), true, "https://drive.google.com/file/d/" + fileId + "/view");
    }

    private static FileCheckRequest check(UUID responseId, String fileId) {
        return new FileCheckRequest(responseId.toString(), "pdf-field", "SRS",
            "https://drive.google.com/file/d/" + fileId + "/view", "client-time");
    }

    private void admin() {
        when(security.requireSession(request)).thenReturn(new StoredWildTrackSession(
            "test-hash", "staff-subject", "staff@example.invalid", Instant.now(), Instant.now().plusSeconds(120)));
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADMIN));
    }

    private void adviser() {
        when(security.requireSession(request)).thenReturn(new StoredWildTrackSession(
            "test-hash", "staff-subject", "staff@example.invalid", Instant.now(), Instant.now().plusSeconds(120)));
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADVISER));
        when(staff.assignedTeams("staff-subject", workspaceId)).thenReturn(List.of("my-team"));
    }
}
