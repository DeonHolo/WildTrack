package com.capvault.backend.response;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.staff.AdviserTeamAssignment;
import com.capvault.backend.staff.AdviserTeamAssignmentRepository;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ticket 06 follow-up: the per-response feedback endpoints are scoped exactly like the staff
 * queue, so an adviser cannot reach an unassigned team by calling the API directly.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ReviewFeedbackScopeControllerTest {

    private static final String ASSIGNED_TEAM = "IT41";
    private static final String OTHER_TEAM = "IT42";
    private static final String FEEDBACK_BODY =
        "{\"note\":\"Tighten the scope section.\",\"visibility\":\"STUDENT_VISIBLE\"}";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private WildTrackSessionService sessionService;

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
    private StaffRoleAssignmentRepository staffRoleRepository;

    @Autowired
    private AdviserTeamAssignmentRepository adviserTeamRepository;

    private UUID workspaceId;
    private UUID assignedResponseId;
    private UUID otherResponseId;

    @BeforeEach
    void seed() {
        var workspace = workspaceRepository.save(
            new AcademicWorkspace("IT332 Sem 2", "IT", "IT332", "Semester 2", "2026-27", true));
        workspaceId = workspace.getId();
        var deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, "SRS", "SRS Submission", "srs-week9",
            "Submit a PDF Drive link.", LocalDateTime.parse("2026-04-18T23:59:00"),
            true, DeliverableStatus.PUBLISHED));

        assignedResponseId = submitFor(deliverable.getId(), "20-0649-750", "Deon Holo",
            ASSIGNED_TEAM, "sub-student-a", "a@gmail.com");
        otherResponseId = submitFor(deliverable.getId(), "20-0649-751", "Other Student",
            OTHER_TEAM, "sub-student-b", "b@gmail.com");
    }

    private UUID submitFor(UUID deliverableId, String studentNumber, String name, String teamCode,
                           String subject, String email) {
        studentRecordRepository.save(new StudentRecord(
            workspaceId, studentNumber, name, teamCode, "1", teamCode, "Sir Adviser", null, 1));
        associationService.confirmAssociation(workspaceId, subject, email, studentNumber);
        return responseService.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, subject, email,
            Map.of("driveLink", "https://drive.example/" + studentNumber))).response().getId();
    }

    private String sessionTokenFor(String subject, String email, StaffRole... roles) {
        Instant now = Instant.now();
        for (StaffRole role : roles) {
            staffRoleRepository.save(new StaffRoleAssignment(
                UUID.randomUUID(), subject, email, role, true, now, now));
        }
        return sessionService.create(new GoogleIdentity(subject, email, "Staff Tester", null)).rawToken();
    }

    private Cookie sessionCookie(String rawToken) {
        return new Cookie("WILDTRACK_SESSION", rawToken);
    }

    private String adviserAssignedToOneTeam() {
        String token = sessionTokenFor("sub-adviser", "adviser@school.edu", StaffRole.ADVISER);
        adviserTeamRepository.save(new AdviserTeamAssignment(
            UUID.randomUUID(), workspaceId, "sub-adviser", ASSIGNED_TEAM, Instant.now()));
        return token;
    }

    @Test
    void adviserCanCommentOnAnAssignedTeamsResponse() throws Exception {
        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/feedback")
                .cookie(sessionCookie(adviserAssignedToOneTeam()))
                .contentType("application/json")
                .content(FEEDBACK_BODY)
                .with(csrf()))
            .andExpect(status().isOk());
    }

    @Test
    void adviserCannotCommentOnAnUnassignedTeamsResponse() throws Exception {
        mockMvc.perform(post("/api/workspace/responses/" + otherResponseId + "/feedback")
                .cookie(sessionCookie(adviserAssignedToOneTeam()))
                .contentType("application/json")
                .content(FEEDBACK_BODY)
                .with(csrf()))
            .andExpect(status().isForbidden());
    }

    @Test
    void adviserCannotReadAnUnassignedTeamsFeedbackHistory() throws Exception {
        mockMvc.perform(get("/api/workspace/responses/" + otherResponseId + "/feedback")
                .cookie(sessionCookie(adviserAssignedToOneTeam())))
            .andExpect(status().isForbidden());
    }

    @Test
    void adviserCannotRevokeAnUnassignedTeamsAcceptance() throws Exception {
        mockMvc.perform(post("/api/workspace/responses/" + otherResponseId + "/revoke")
                .cookie(sessionCookie(adviserAssignedToOneTeam()))
                .with(csrf()))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminReachesEveryTeamsResponse() throws Exception {
        String token = sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN);

        mockMvc.perform(post("/api/workspace/responses/" + otherResponseId + "/feedback")
                .cookie(sessionCookie(token))
                .contentType("application/json")
                .content(FEEDBACK_BODY)
                .with(csrf()))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/workspace/responses/" + otherResponseId + "/feedback")
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk());
    }

    @Test
    void studentStillReadsTheirOwnFeedbackButNotAnotherStudents() throws Exception {
        String token = sessionTokenFor("sub-student-a", "a@gmail.com");

        mockMvc.perform(get("/api/workspace/responses/" + assignedResponseId + "/feedback")
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/workspace/responses/" + otherResponseId + "/feedback")
                .cookie(sessionCookie(token)))
            .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(get("/api/workspace/responses/" + assignedResponseId + "/feedback"))
            .andExpect(status().isUnauthorized());
    }
}
