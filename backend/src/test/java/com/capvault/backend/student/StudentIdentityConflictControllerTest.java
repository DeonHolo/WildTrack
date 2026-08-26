package com.capvault.backend.student;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.hasSize;

import java.time.Instant;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Identity conflicts are an Admin-only queue: listing exposes the Student Record plus both
 * competing Google identities, a decision is persisted and removes the row from the open
 * list, and students can neither read nor decide conflicts even by direct API call.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentIdentityConflictControllerTest {

    private static final String STUDENT_NUMBER = "20-0649-750";
    private static final String FIRST_SUBJECT = "sub-first-owner";
    private static final String FIRST_EMAIL = "rontaghoy@gmail.com";
    private static final String SECOND_SUBJECT = "sub-second-owner";
    private static final String SECOND_EMAIL = "impostor@gmail.com";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private WildTrackSessionService sessionService;

    @Autowired
    private StudentAssociationService associationService;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired
    private StaffRoleAssignmentRepository staffRoleRepository;

    @Autowired
    private StudentIdentityConflictRepository conflictRepository;

    private UUID workspaceId;

    @BeforeEach
    void seedConflict() {
        var workspace = workspaceRepository.save(
            new AcademicWorkspace("IT332 Sem 2", "IT", "IT332", "Semester 2", "2026-27", true));
        workspaceId = workspace.getId();
        studentRecordRepository.save(new StudentRecord(
            workspaceId, STUDENT_NUMBER, "Deon Holo", "IT41", "1", "IT41", "Sir Adviser", null, 1));

        associationService.confirmAssociation(workspaceId, FIRST_SUBJECT, FIRST_EMAIL, STUDENT_NUMBER);
        associationService.confirmAssociation(workspaceId, SECOND_SUBJECT, SECOND_EMAIL, STUDENT_NUMBER);
    }

    private String sessionTokenFor(String subject, String email, StaffRole... roles) {
        Instant now = Instant.now();
        for (StaffRole role : roles) {
            staffRoleRepository.save(new StaffRoleAssignment(
                UUID.randomUUID(), subject, email, role, true, now, now));
        }
        return sessionService.create(new GoogleIdentity(subject, email, "Tester", null)).rawToken();
    }

    private Cookie sessionCookie(String rawToken) {
        return new Cookie("WILDTRACK_SESSION", rawToken);
    }

    private UUID openConflictId() {
        return conflictRepository.findAllByWorkspaceIdOrderByCreatedAtDesc(workspaceId).get(0).getId();
    }

    @Test
    void adminSeesTheStudentRecordAndBothCompetingIdentities() throws Exception {
        String token = sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN);

        mockMvc.perform(get("/api/workspace/students/identity-conflicts")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].status").value("OPEN"))
            .andExpect(jsonPath("$[0].studentNumber").value(STUDENT_NUMBER))
            .andExpect(jsonPath("$[0].studentName").value("Deon Holo"))
            .andExpect(jsonPath("$[0].teamCode").value("IT41"))
            .andExpect(jsonPath("$[0].existingIdentity.googleEmail").value(FIRST_EMAIL))
            .andExpect(jsonPath("$[0].conflictingIdentity.googleEmail").value(SECOND_EMAIL));
    }

    @Test
    void resolvingAConflictRecordsTheDecisionAndClearsTheOpenList() throws Exception {
        String token = sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN);
        UUID conflictId = openConflictId();

        mockMvc.perform(post("/api/workspace/students/identity-conflicts/" + conflictId + "/decision")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"RESOLVED\",\"note\":\"Kept the first account.\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("RESOLVED"))
            .andExpect(jsonPath("$.decidedBySubject").value("sub-admin"))
            .andExpect(jsonPath("$.decisionNote").value("Kept the first account."))
            .andExpect(jsonPath("$.decidedAt").exists());

        mockMvc.perform(get("/api/workspace/students/identity-conflicts")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void dismissingAConflictAlsoClearsTheOpenList() throws Exception {
        String token = sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN);
        UUID conflictId = openConflictId();

        mockMvc.perform(post("/api/workspace/students/identity-conflicts/" + conflictId + "/decision")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"DISMISSED\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DISMISSED"));

        mockMvc.perform(get("/api/workspace/students/identity-conflicts")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void anUnknownDecisionIsRejected() throws Exception {
        String token = sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN);
        UUID conflictId = openConflictId();

        mockMvc.perform(post("/api/workspace/students/identity-conflicts/" + conflictId + "/decision")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"MAYBE\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void adviserCannotReadOrDecideConflicts() throws Exception {
        String token = sessionTokenFor("sub-adviser", "adviser@school.edu", StaffRole.ADVISER);
        UUID conflictId = openConflictId();

        mockMvc.perform(get("/api/workspace/students/identity-conflicts")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/workspace/students/identity-conflicts/" + conflictId + "/decision")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"RESOLVED\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void studentCannotReadOrDecideConflicts() throws Exception {
        String token = sessionTokenFor(FIRST_SUBJECT, FIRST_EMAIL);
        UUID conflictId = openConflictId();

        mockMvc.perform(get("/api/workspace/students/identity-conflicts")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/workspace/students/identity-conflicts/" + conflictId + "/decision")
                .param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"RESOLVED\"}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedRequestsAreRejected() throws Exception {
        mockMvc.perform(get("/api/workspace/students/identity-conflicts")
                .param("workspaceId", workspaceId.toString()))
            .andExpect(status().isUnauthorized());
    }
}
