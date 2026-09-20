package com.capvault.backend.drivehistory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.drivehistory.auth.DelegatedDriveAccessService;
import com.capvault.backend.drivehistory.auth.DelegatedDriveGateway;
import com.capvault.backend.drivehistory.auth.DriveRevisionMetadata;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.student.StudentAssociationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class SharedDriveHistoryServiceTest {
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID deliverableId = UUID.randomUUID();
    private final UUID studentAId = UUID.randomUUID();
    private final UUID studentBId = UUID.randomUUID();
    private final StudentAssociationSecurity security = mock(StudentAssociationSecurity.class);
    private final StudentAssociationService associations = mock(StudentAssociationService.class);
    private final StaffManagementService staff = mock(StaffManagementService.class);
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final DeliverableRepository deliverables = mock(DeliverableRepository.class);
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
    private final DelegatedDriveAccessService access = mock(DelegatedDriveAccessService.class);
    private final DelegatedDriveGateway gateway = mock(DelegatedDriveGateway.class);
    private final HttpServletRequest http = mock(HttpServletRequest.class);
    private SharedDriveHistoryService history;
    private FormResponse viewerSubmission;
    private FormResponse ownerSubmission;

    @BeforeEach
    void setup() {
        history = new SharedDriveHistoryService(security, associations, staff, responses, deliverables,
            fields, new ObjectMapper(), access, gateway);
        viewerSubmission = response("viewer-sub", studentAId, "viewer", "23-0001",
            "https://drive.google.com/open?id=shared-PDF-id");
        ownerSubmission = response("owner-sub", studentBId, "owner", "23-0002",
            "https://drive.google.com/file/d/shared-PDF-id/view?usp=sharing");
        when(responses.findById(viewerSubmission.getId())).thenReturn(Optional.of(viewerSubmission));
        when(responses.findAll()).thenReturn(List.of(viewerSubmission, ownerSubmission));
        Deliverable deliverable = mock(Deliverable.class);
        when(deliverables.findById(deliverableId)).thenReturn(Optional.of(deliverable));
        when(deliverable.getWorkspaceId()).thenReturn(workspaceId);
        when(deliverable.getId()).thenReturn(deliverableId);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId)).thenReturn(List.of(
            new DeliverableField("pdf-field-id", deliverableId, "pdfLink", "PDF", DeliverableFieldType.DRIVE_PDF,
                true, 0, DocumentCheckPolicy.AUTO, true, true)));
        when(security.requireSession(http)).thenReturn(
            new StoredWildTrackSession("hash", "viewer", "viewer@example.com", Instant.now(), Instant.now().plusSeconds(300)));
        when(security.activeRoles(http)).thenReturn(Set.of());
        when(associations.activeAssociation(workspaceId, "viewer")).thenReturn(Optional.of(association(studentAId)));
        when(associations.activeAssociation(workspaceId, "owner")).thenReturn(Optional.of(association(studentBId)));
        when(access.isConfigured()).thenReturn(true);
        when(access.connected("owner")).thenReturn(true);
        when(access.accessTokenForSubject("owner")).thenReturn(Optional.of("owner-secret-token"));
        when(gateway.revisions(eq("owner-secret-token"), eq("shared-PDF-id"), nullable(String.class), eq(50))).thenReturn(
            new DelegatedDriveGateway.Page(List.of(
                new DriveRevisionMetadata("rev-2", "2026-09-19T00:00:00Z", "application/pdf",
                    "123", true, "Drive Editor", "private-editor@example.com")), null));
        when(gateway.fileMetadata("owner-secret-token", "shared-PDF-id")).thenReturn(
            new DelegatedDriveGateway.FileDetails("2026-09-01T00:00:00Z", "Private Owner",
                "2026-09-19T00:00:00Z", "Private Editor"));
    }

    @Test
    void ownerAuthorizingLaterUnlocksSameFileForViewerWhoSubmittedDifferentLinkForm() {
        SharedDriveHistoryView result = history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http);

        assertThat(result.status()).isEqualTo("AVAILABLE");
        assertThat(result.sourceFileId()).isEqualTo("shared-PDF-id");
        assertThat(result.revisions()).extracting(SharedDriveHistoryView.Revision::id).containsExactly("rev-2");
        assertThat(result.revisions().get(0).modifiedBy()).isNull();
        assertThat(result.revisions().get(0).modifiedByEmail()).isNull();
        assertThat(result.fileMetadata().createdTime()).isEqualTo("2026-09-01T00:00:00Z");
        assertThat(result.fileMetadata().lastModifiedTime()).isEqualTo("2026-09-19T00:00:00Z");
        assertThat(result.fileMetadata().driveOwner()).isNull();
        assertThat(result.fileMetadata().lastModifiedBy()).isNull();
        assertThat(result.coverageMessage()).contains("same", "omit older revisions", "not proof");
    }

    @Test
    void disconnectedOriginalSubmitterCanNoLongerSupplySharedAccess() {
        when(associations.activeAssociation(workspaceId, "owner")).thenReturn(Optional.empty());

        SharedDriveHistoryView result = history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http);

        assertThat(result.status()).isEqualTo("NOT_CONNECTED");
        assertThat(result.revisions()).isEmpty();
    }

    @Test
    void differentFileWithSameOwnerTokenNeverInheritsTheHistory() {
        ownerSubmission = response("owner-sub", studentBId, "owner", "23-0002",
            "https://drive.google.com/file/d/unrelated-PDF-id/view");
        when(responses.findAll()).thenReturn(List.of(viewerSubmission, ownerSubmission));

        SharedDriveHistoryView result = history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http);

        assertThat(result.status()).isEqualTo("NOT_CONNECTED");
        assertThat(result.revisions()).isEmpty();
    }

    @Test
    void refusalOrRevocationDoesNotBlockTheOrdinarySubmission() {
        when(access.connected("owner")).thenReturn(false);

        SharedDriveHistoryView result = history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http);

        assertThat(result.status()).isEqualTo("NOT_CONNECTED");
        assertThat(result.revisions()).isEmpty();
    }

    @Test
    void otherStudentCannotRequestAnUnownedResponseOrArbitraryPdfField() {
        when(security.requireSession(http)).thenReturn(
            new StoredWildTrackSession("hash", "unrelated-subject", "n@example.com", Instant.now(), Instant.now().plusSeconds(300)));
        assertThatThrownBy(() -> history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http)).isInstanceOf(AccessDeniedException.class);
        when(security.requireSession(http)).thenReturn(
            new StoredWildTrackSession("hash", "viewer", "v@example.com", Instant.now(), Instant.now().plusSeconds(300)));
        assertThatThrownBy(() -> history.forSubmission(workspaceId, viewerSubmission.getId(),
            "fake-field", null, http)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void paginationUsesTheSameActiveGrantAndDoesNotExposeGooglePageTokens() {
        when(gateway.revisions(eq("owner-secret-token"), eq("shared-PDF-id"),
            nullable(String.class), eq(50))).thenReturn(new DelegatedDriveGateway.Page(
                List.of(new DriveRevisionMetadata("rev-2", "2026-09-19T00:00:00Z", "application/pdf",
                    "123", true, "Drive Editor", "private-editor@example.com")), "google-page-secret"));
        SharedDriveHistoryView first = history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http);
        assertThat(first.nextPageToken()).isNotBlank().isNotEqualTo("google-page-secret");
        when(gateway.revisions("owner-secret-token", "shared-PDF-id", "google-page-secret", 50))
            .thenReturn(new DelegatedDriveGateway.Page(List.of(new DriveRevisionMetadata(
                "rev-1", "2026-09-18T00:00:00Z", "application/pdf", "111", false,
                "Drive Editor", "private-editor@example.com")), null));
        SharedDriveHistoryView second = history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", first.nextPageToken(), http);
        assertThat(second.revisions()).extracting(SharedDriveHistoryView.Revision::id)
            .containsExactly("rev-1");
        assertThat(second.revisions().get(0).modifiedByEmail()).isNull();
        assertThat(second.nextPageToken()).isNull();
        when(access.connected("owner")).thenReturn(false);
        assertThat(history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", first.nextPageToken(), http).status()).isEqualTo("NOT_CONNECTED");
        assertThatThrownBy(() -> history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", "google-page-secret", http)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void assignedAdviserCanSeeProviderIdentityButUnassignedAdviserCannot() {
        when(security.requireSession(http)).thenReturn(new StoredWildTrackSession(
            "hash", "adviser", "adviser@example.com", Instant.now(), Instant.now().plusSeconds(300)));
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADVISER));
        when(staff.assignedTeams("adviser", workspaceId)).thenReturn(List.of("TEAM-A"));
        SharedDriveHistoryView result = history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http);
        assertThat(result.revisions().get(0).modifiedByEmail()).isEqualTo("private-editor@example.com");
        assertThat(result.fileMetadata().driveOwner()).isEqualTo("Private Owner");
        when(staff.assignedTeams("adviser", workspaceId)).thenReturn(List.of("TEAM-Z"));
        assertThatThrownBy(() -> history.forSubmission(workspaceId, viewerSubmission.getId(),
            "pdf-field-id", null, http)).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void legacyDocumentPdfFieldKeyResolvesAndOtherKeysAreRejected() {
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId)).thenReturn(List.of());
        Deliverable legacy = deliverables.findById(deliverableId).orElseThrow();
        when(legacy.isPdfRequired()).thenReturn(true);
        FormResponse old = new FormResponse(UUID.randomUUID(), workspaceId, deliverableId,
            "viewer", "viewer@example.com", studentAId, "23-0001", "Student", "TEAM-A",
            "{\"documentPdf\":\"https://drive.google.com/file/d/shared-PDF-id/view\"}",
            Instant.now(), Instant.now());
        when(responses.findById(old.getId())).thenReturn(Optional.of(old));
        FormResponse legacyOwner = new FormResponse(UUID.randomUUID(), workspaceId, deliverableId,
            "owner", "owner@example.com", studentBId, "23-0002", "Owner", "TEAM-B",
            "{\"documentPdf\":\"https://drive.google.com/open?id=shared-PDF-id\"}",
            Instant.now(), Instant.now());
        when(responses.findAll()).thenReturn(List.of(old, legacyOwner));
        SharedDriveHistoryView result = history.forSubmission(workspaceId, old.getId(),
            "documentPdf", null, http);
        assertThat(result.status()).isEqualTo("AVAILABLE");
        assertThat(result.sourceFileId()).isEqualTo("shared-PDF-id");
        assertThatThrownBy(() -> history.forSubmission(workspaceId, old.getId(),
            "unrelated-url-field", null, http)).isInstanceOf(IllegalArgumentException.class);
    }
    private FormResponse response(String label, UUID recordId, String subject, String studentNumber, String link) {
        return new FormResponse(UUID.nameUUIDFromBytes(label.getBytes()), workspaceId, deliverableId,
            subject, subject + "@example.com", recordId, studentNumber, label, "TEAM-A",
            "{\"pdfLink\":\"" + link + "\"}", Instant.now(), Instant.now());
    }

    private StudentAssociationService.AssociationView association(UUID recordId) {
        return new StudentAssociationService.AssociationView(recordId, workspaceId, "student@example.com",
            recordId, "23-0001", "Student", "TEAM-A", "CANONICAL");
    }
}
