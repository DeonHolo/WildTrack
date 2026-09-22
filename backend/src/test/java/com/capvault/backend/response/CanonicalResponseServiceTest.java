package com.capvault.backend.response;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentIdentityConflictRepository;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CanonicalResponseServiceTest {

    @Autowired
    private CanonicalResponseService canonicalService;

    @Autowired
    private FormResponseRepository responseRepository;

    @Autowired
    private FormResponseService responseService;

    @Autowired
    private StudentAssociationService associationService;

    @Autowired
    private StudentIdentityConflictRepository conflictRepository;

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private DeliverableRepository deliverableRepository;

    private UUID workspaceId;
    private UUID deliverableId;
    private UUID studentRecordId;
    private String rosterNumber = "20-0649-750";

    @BeforeEach
    void seed() {
        AcademicWorkspace workspace = workspaceRepository.save(new AcademicWorkspace(
            "IT332 Sem 2", "IT", "IT332", "Semester 1", "2026-27", true));
        workspaceId = workspace.getId();
        StudentRecord record = studentRecordRepository.save(new StudentRecord(
            workspaceId, rosterNumber, "Deon Holo", "2526-it332-41", "1", "IT41", "Sir Adviser", null, 1));
        studentRecordId = record.getId();
        Deliverable deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, "SRS", "SRS Submission", "srs-week9",
            "Submit a PDF Drive link.", LocalDateTime.parse("2026-04-18T23:59:00"),
            true, DeliverableStatus.PUBLISHED));
        deliverableId = deliverable.getId();
        associationService.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", rosterNumber);
    }

    private UUID submitFor(String subject, String marker) {
        return responseService.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, subject, subject + "@gmail.com",
            rosterNumber, Map.of("driveLink", "https://drive.example/" + marker), null))
            .response().getId();
    }

    /** Historical collision fixture: legacy responses existed before first-save account binding.
     * Never submit under the second Google identity to bypass today's binding rules. */
    private UUID saveHistoricalConflictingResponse(String marker) {
        var existing = responseService.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow();
        Instant savedAt = existing.getSubmittedAt();
        var legacy = new FormResponse(UUID.randomUUID(), workspaceId, deliverableId, "sub-B", "b@gmail.com",
            studentRecordId, rosterNumber, existing.getStudentName(), existing.getTeamCode(),
            "{\"driveLink\":\"https://drive.example/" + marker + "\"}", savedAt, savedAt);
        return responseRepository.saveAndFlush(legacy).getId();
    }

    @Test
    void unresolvedCompetingLegacyClaimsBlockBothFirstSubmissionsWithoutOverwriting() {
        // Multiple historical self-declared associations are a real conflict, not
        // permission for either Google subject to win the first-successful-save claim.
        associationService.confirmAssociation(workspaceId, "sub-B", "b@gmail.com", rosterNumber);
        assertThat(conflictRepository.findAllByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).hasSize(1);
        assertThatThrownBy(() -> submitFor("sub-A", "a-version"))
            .isInstanceOf(StudentAssociationService.AccountBindingConflictException.class)
            .hasMessageContaining("unresolved account claims");
        assertThatThrownBy(() -> submitFor("sub-B", "b-version"))
            .isInstanceOf(StudentAssociationService.AccountBindingConflictException.class)
            .hasMessageContaining("unresolved account claims");
        assertThat(responseRepository.findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, "sub-A"))
            .isEmpty();
        assertThat(responseRepository.findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, "sub-B"))
            .isEmpty();
    }

    @Test
    void firstAcceptedResponseBecomesCanonical() {
        UUID responseA = submitFor("sub-A", "first");
        canonicalService.recordAcceptanceIfFirst(
            responseService.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow(), "admin-sir");

        UUID historicalResponseB = saveHistoricalConflictingResponse("second");
        canonicalService.recordAcceptanceIfFirst(responseRepository.findById(historicalResponseB).orElseThrow(), "admin-sir");

        var canonicalId = canonicalService.canonicalResponseId(workspaceId, deliverableId, studentRecordId).orElseThrow();
        assertThat(canonicalId).isEqualTo(responseA); // later conflict did NOT replace it
    }

    @Test
    void adminCanCorrectCanonicalWithAuditTrail() {
        UUID responseA = submitFor("sub-A", "original");
        canonicalService.recordAcceptanceIfFirst(
            responseService.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow(), "admin-sir");
        UUID responseB = saveHistoricalConflictingResponse("corrected");

        var selection = canonicalService.selectCanonical(
            workspaceId, deliverableId, studentRecordId, responseB, "admin-sir", "Student confirmed correct author");

        assertThat(selection.getCanonicalResponseId()).isEqualTo(responseB);
        assertThat(selection.getPreviousResponseId()).isEqualTo(responseA);
        assertThat(selection.getReason()).contains("confirmed");
        // Canonical now points to B:
        assertThat(canonicalService.canonicalResponseId(workspaceId, deliverableId, studentRecordId))
            .contains(responseB);
    }

    @Test
    void crossWorkspaceCorrectionIsRejected() {
        AcademicWorkspace other = workspaceRepository.save(new AcademicWorkspace(
            "CS Sem 1", "CS", "CS101", "Semester 1", "2026-27", true));
        UUID otherWorkspaceId = other.getId();

        UUID responseA = submitFor("sub-A", "mine");
        assertThatThrownByIsRejected(otherWorkspaceId, responseA);
    }

    private void assertThatThrownByIsRejected(UUID otherWorkspaceId, UUID responseA) {
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
            canonicalService.selectCanonical(otherWorkspaceId, deliverableId, studentRecordId, responseA, "admin-sir", ""))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
