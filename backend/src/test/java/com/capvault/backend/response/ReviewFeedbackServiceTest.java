package com.capvault.backend.response;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.staff.AdviserTeamAssignmentRepository;
import com.capvault.backend.staff.AdviserTeamAssignment;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ReviewFeedbackServiceTest {

    @Autowired
    private ReviewFeedbackService service;

    @Autowired
    private FormResponseService responseService;

    @Autowired
    private StudentAssociationService associationService;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired
    private DeliverableRepository deliverableRepository;

    @Autowired
    private AdviserTeamAssignmentRepository adviserTeamRepository;

    private UUID workspaceId;
    private UUID deliverableId;
    private String rosterNumber = "20-0649-750";

    @BeforeEach
    void seed() {
        var ws = workspaceRepository.save(new AcademicWorkspace("IT332", "IT", "IT332", "Sem 1", "2026-27", true));
        workspaceId = ws.getId();
        studentRecordRepository.save(new StudentRecord(
            workspaceId, rosterNumber, "Deon Holo", "2526-it41-t01", "1", "IT41", "Sir Adviser", null, 1));
        var deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, "SRS", "SRS Submission", "srs-week9",
            "Submit a PDF Drive link.", LocalDateTime.parse("2026-04-18T23:59:00"),
            true, DeliverableStatus.PUBLISHED));
        deliverableId = deliverable.getId();
        associationService.confirmAssociation(workspaceId, "sub-student", "s@gmail.com", rosterNumber);
        responseService.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, "sub-student", "s@gmail.com",
            Map.of("driveLink", "https://drive.example/submitted")));
        // Assigned adviser for this team:
        adviserTeamRepository.save(new AdviserTeamAssignment(
            UUID.randomUUID(), workspaceId, "sub-adviser", "2526-it41-t01", java.time.Instant.now()));
    }

    private UUID responseId() {
        return responseService.ownedResponse(workspaceId, deliverableId, "sub-student").orElseThrow().getId();
    }

    @Test
    void staffSavesAndEditsOneCurrentFeedbackNote() {
        UUID rid = responseId();

        var first = service.saveFeedback(rid, "sub-adviser", "adv@school.edu", "ADVISER", "Good structure.", "Student");
        var second = service.saveFeedback(rid, "sub-adviser", "adv@school.edu", "ADVISER", "Revise chapter 2.", "Student");

        assertThat(second.getId()).isEqualTo(first.getId()); // edited in place
        var history = service.feedbackFor(rid);
        assertThat(history).hasSize(1);
        assertThat(history.get(0).getNote()).isEqualTo("Revise chapter 2.");
    }

    @Test
    void studentCannotSaveStaffFeedback() {
        UUID rid = responseId();
        assertThatThrownBy(() -> service.saveFeedback(rid, "sub-student", "s@gmail.com", "STUDENT", "note", "Student"))
            .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void assignedAdviserCanAcceptOwnTeamResponse() {
        UUID rid = responseId();
        var acceptance = service.accept(rid, "sub-adviser", "adv@school.edu", "ADVISER");

        assertThat(acceptance.getRevokedAt()).isNull();
        assertThat(service.activeAcceptance(rid)).isPresent();
    }

    @Test
    void unassignedAdviserCannotAcceptOtherTeamResponses() {
        // A different team's adviser (no assignment for this workspace/team):
        adviserTeamRepository.save(new AdviserTeamAssignment(
            UUID.randomUUID(), workspaceId, "sub-other-adviser", "some-other-team", java.time.Instant.now()));

        UUID rid = responseId();
        assertThatThrownBy(() -> service.accept(rid, "sub-other-adviser", "o@school.edu", "ADVISER"))
            .isInstanceOf(AccessDeniedException.class)
            .hasMessageContaining("assigned teams");
    }

    @Test
    void revokeClearsAcceptance() {
        UUID rid = responseId();
        service.accept(rid, "sub-adviser", "adv@school.edu", "ADVISER");
        service.revoke(rid);

        assertThat(service.activeAcceptance(rid)).isEmpty();
    }
}
