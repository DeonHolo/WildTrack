package com.capvault.backend.response;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
 * Adviser team scoping is enforced at the controller seam: a direct API call as an
 * adviser can never return another team's submissions, and admins still see everything.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class FormResponseStaffViewControllerTest {

    private static final String ASSIGNED_TEAM = "IT41";
    private static final String OTHER_TEAM = "IT42";

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

    @BeforeEach
    void seed() {
        var workspace = workspaceRepository.save(
            new AcademicWorkspace("IT332 Sem 2", "IT", "IT332", "Semester 2", "2026-27", true));
        workspaceId = workspace.getId();
        var deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, "SRS", "SRS Submission", "srs-week9",
            "Submit a PDF Drive link.", LocalDateTime.parse("2026-04-18T23:59:00"),
            true, DeliverableStatus.PUBLISHED));

        submitFor(deliverable.getId(), "20-0649-750", "Deon Holo", ASSIGNED_TEAM, "sub-student-a", "a@gmail.com");
        submitFor(deliverable.getId(), "20-0649-751", "Other Student", OTHER_TEAM, "sub-student-b", "b@gmail.com");
    }

    private void submitFor(UUID deliverableId, String studentNumber, String name, String teamCode,
                           String subject, String email) {
        studentRecordRepository.save(new StudentRecord(
            workspaceId, studentNumber, name, teamCode, "1", teamCode, "Sir Adviser", null, 1));
        associationService.confirmAssociation(workspaceId, subject, email, studentNumber);
        responseService.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, subject, email,
            Map.of("driveLink", "https://drive.example/" + studentNumber)));
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

    @Test
    void adviserSeesOnlyAssignedTeamsSubmissions() throws Exception {
        String token = sessionTokenFor("sub-adviser", "adviser@school.edu", StaffRole.ADVISER);
        adviserTeamRepository.save(new AdviserTeamAssignment(
            UUID.randomUUID(), workspaceId, "sub-adviser", ASSIGNED_TEAM, Instant.now()));

        mockMvc.perform(get("/api/workspace/responses/staff")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[*].teamCode", contains(ASSIGNED_TEAM)));
    }

    @Test
    void adviserWithoutAssignedTeamsSeesNothing() throws Exception {
        String token = sessionTokenFor("sub-lonely-adviser", "lonely@school.edu", StaffRole.ADVISER);

        mockMvc.perform(get("/api/workspace/responses/staff")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void adminSeesEveryTeamsSubmissions() throws Exception {
        String token = sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN);

        mockMvc.perform(get("/api/workspace/responses/staff")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void authenticatedStudentCannotReadTheStaffQueue() throws Exception {
        String token = sessionTokenFor("sub-student-a", "a@gmail.com");

        mockMvc.perform(get("/api/workspace/responses/staff")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(get("/api/workspace/responses/staff")
                .param("workspaceId", workspaceId.toString()))
            .andExpect(status().isUnauthorized());
    }
}
