package com.capvault.backend.response;

import java.time.LocalDateTime;
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

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CanonicalResponseServiceTest {

    @Autowired
    private CanonicalResponseService canonicalService;

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
        // Two Google identities associate the same roster record (conflict scenario)
        associationService.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", rosterNumber);
        associationService.confirmAssociation(workspaceId, "sub-B", "b@gmail.com", rosterNumber);
    }

    private UUID submitFor(String subject, String marker) {
        return responseService.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, subject, subject + "@gmail.com",
            Map.of("driveLink", "https://drive.example/" + marker)))
            .response().getId();
    }

    @Test
    void duplicateIdentitySubmissionRecordsConflictWithoutOverwriting() {
        UUID responseA = submitFor("sub-A", "a-version");
        UUID responseB = submitFor("sub-B", "b-version");

        // Separate preserved responses:
        assertThat(responseA).isNotEqualTo(responseB);
        var viewA = responseService.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow();
        var viewB = responseService.ownedResponse(workspaceId, deliverableId, "sub-B").orElseThrow();
        assertThat(viewA.getValuesJson()).contains("a-version").doesNotContain("b-version");
        assertThat(viewB.getValuesJson()).contains("b-version").doesNotContain("a-version");

        // Conflict was recorded from ticket 03 flow:
        assertThat(conflictRepository.findAllByWorkspaceIdOrderByCreatedAtDesc(workspaceId)).hasSize(1);
    }

    @Test
    void firstAcceptedResponseBecomesCanonical() {
        UUID responseA = submitFor("sub-A", "first");
        canonicalService.recordAcceptanceIfFirst(
            responseService.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow(), "admin-sir");

        submitFor("sub-B", "second"); // conflicting later response

        var canonicalId = canonicalService.canonicalResponseId(workspaceId, deliverableId, studentRecordId).orElseThrow();
        assertThat(canonicalId).isEqualTo(responseA); // later conflict did NOT replace it
    }

    @Test
    void adminCanCorrectCanonicalWithAuditTrail() {
        UUID responseA = submitFor("sub-A", "original");
        canonicalService.recordAcceptanceIfFirst(
            responseService.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow(), "admin-sir");
        UUID responseB = submitFor("sub-B", "corrected");

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
