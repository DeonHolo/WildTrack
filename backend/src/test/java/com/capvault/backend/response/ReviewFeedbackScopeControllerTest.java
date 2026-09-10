package com.capvault.backend.response;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
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
    private jakarta.persistence.EntityManager entityManager;

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
    private DeliverableFieldRepository deliverableFieldRepository;

    @Autowired
    private StaffRoleAssignmentRepository staffRoleRepository;

    @Autowired
    private AdviserTeamAssignmentRepository adviserTeamRepository;

    @Autowired
    private FormResponseRepository responseRepository;

    @Autowired
    private ResponseAcceptanceRepository acceptanceRepository;

    @Autowired
    private com.capvault.backend.archive.ArchiveRecordRepository archiveRepository;

    private UUID workspaceId;
    private UUID assignedResponseId;
    private UUID otherResponseId;

    @Test
    void monitoringRestoresArchivedStateOnlyForTheCurrentResponseVersion() throws Exception {
        String admin = sessionTokenFor("archive-admin", "archive-admin@school.edu", StaffRole.ADMIN);
        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/accept")
                .cookie(sessionCookie(admin)).with(csrf()))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(admin)).with(csrf()).contentType("application/json")
                .content("{\"responseIds\":[\"" + assignedResponseId + "\"]}"))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(admin)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archivedResponseIds[0]").value(assignedResponseId.toString()));

        var response = responseRepository.findById(assignedResponseId).orElseThrow();
        responseService.submit(new FormResponseService.SubmitCommand(workspaceId, response.getDeliverableId(),
            response.getGoogleSubject(), response.getGoogleEmail(), Map.of("value", "new version"), response.getRevision()));
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(admin)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archivedResponseIds").isEmpty());
    }

    @Test
    void revokeHidesCurrentArchiveWithoutDeletingSnapshotAndReacceptRestoresIt() throws Exception {
        String admin = sessionTokenFor("archive-revoke-admin", "archive-revoke-admin@school.edu", StaffRole.ADMIN);
        Cookie cookie = sessionCookie(admin);
        String body = "{\"responseIds\":[\"" + assignedResponseId + "\"]}";

        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/accept")
                .cookie(cookie).with(csrf()))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString())
                .cookie(cookie).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isOk());

        var response = responseRepository.findById(assignedResponseId).orElseThrow();
        var archived = archiveRepository.findByResponseIdAndSourceResponseUpdatedAt(
            assignedResponseId, response.getUpdatedAt()).orElseThrow();

        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/revoke")
                .cookie(cookie).with(csrf()))
            .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString())
                .cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archivedResponseIds").isEmpty());
        org.assertj.core.api.Assertions.assertThat(archiveRepository.findById(archived.getId())).isPresent();
        org.assertj.core.api.Assertions.assertThat(archiveRepository.countByResponseId(assignedResponseId)).isEqualTo(1);

        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/accept")
                .cookie(cookie).with(csrf()))
            .andExpect(status().isOk());
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString())
                .cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archivedResponseIds[0]").value(assignedResponseId.toString()));
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString())
                .cookie(cookie).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(archived.getId().toString()))
            .andExpect(jsonPath("$[0].version").value("v1"));
        org.assertj.core.api.Assertions.assertThat(archiveRepository.countByResponseId(assignedResponseId)).isEqualTo(1);
        var reused = archiveRepository.findById(archived.getId()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(reused.getArchivedAt()).isEqualTo(archived.getArchivedAt());
        org.assertj.core.api.Assertions.assertThat(reused.getMetadataSha256()).isEqualTo(archived.getMetadataSha256());
    }

    @Test
    void archiveSnapshotsAllTypedArtifactsInsteadOfOnlyTheFirstSubmittedLink() throws Exception {
        var response = responseRepository.findById(assignedResponseId).orElseThrow();
        UUID deliverableId = response.getDeliverableId();
        deliverableFieldRepository.saveAll(java.util.List.of(
            new DeliverableField("archive-form", deliverableId, "validationInstrument", "Validation Instrument",
                DeliverableFieldType.GOOGLE_FORM, true, 0, DocumentCheckPolicy.OFF, false, true),
            new DeliverableField("archive-framework", deliverableId, "frameworkModel", "Framework / Model",
                DeliverableFieldType.DRIVE_PDF, true, 1, DocumentCheckPolicy.MANUAL, true, true),
            new DeliverableField("archive-sheet", deliverableId, "responseSheet", "Validation Response Sheet",
                DeliverableFieldType.GOOGLE_SHEET, true, 2, DocumentCheckPolicy.OFF, false, true),
            new DeliverableField("archive-highlights", deliverableId, "validationHighlights", "MVP Validation Highlights",
                DeliverableFieldType.DRIVE_PDF, true, 3, DocumentCheckPolicy.MANUAL, true, true),
            new DeliverableField("archive-evidence", deliverableId, "validationEvidence", "Validation Evidence",
                DeliverableFieldType.DRIVE_FOLDER, true, 4, DocumentCheckPolicy.OFF, false, true)
        ));
        response.setValuesJson("""
            {"validationInstrument":"https://docs.google.com/forms/d/e/form/viewform",
             "frameworkModel":"https://drive.google.com/file/d/framework/view",
             "responseSheet":"https://docs.google.com/spreadsheets/d/sheet/edit",
             "validationHighlights":"https://drive.google.com/file/d/highlights/view",
             "validationEvidence":"https://drive.google.com/drive/folders/evidence"}
            """);
        responseRepository.saveAndFlush(response);

        String admin = sessionTokenFor("archive-artifacts-admin", "archive-artifacts-admin@school.edu", StaffRole.ADMIN);
        Cookie cookie = sessionCookie(admin);
        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/accept")
                .cookie(cookie).with(csrf()))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString())
                .cookie(cookie).with(csrf()).contentType("application/json")
                .content("{\"responseIds\":[\"" + assignedResponseId + "\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].artifacts.length()").value(5))
            .andExpect(jsonPath("$[0].artifacts[0].label").value("Validation Instrument"))
            .andExpect(jsonPath("$[0].artifacts[0].fieldType").value("GOOGLE_FORM"))
            .andExpect(jsonPath("$[0].artifacts[1].label").value("Framework / Model"))
            .andExpect(jsonPath("$[0].artifacts[1].fieldType").value("DRIVE_PDF"))
            .andExpect(jsonPath("$[0].artifacts[3].label").value("MVP Validation Highlights"))
            .andExpect(jsonPath("$[0].artifacts[4].fieldType").value("DRIVE_FOLDER"));

        var archived = archiveRepository.findByResponseIdAndSourceResponseUpdatedAt(
            assignedResponseId, response.getUpdatedAt()).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(archived.getArtifactSnapshotJson())
            .contains("validationInstrument", "frameworkModel", "responseSheet", "validationHighlights", "validationEvidence");
    }

    @Test
    void monitoringRequiresAcceptanceToMatchCurrentVersionEvenWhenArchiveSnapshotMatches() throws Exception {
        String admin = sessionTokenFor("archive-version-admin", "archive-version-admin@school.edu", StaffRole.ADMIN);
        Cookie cookie = sessionCookie(admin);
        String body = "{\"responseIds\":[\"" + assignedResponseId + "\"]}";

        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/accept")
                .cookie(cookie).with(csrf()))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString())
                .cookie(cookie).with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isOk());

        var response = responseRepository.findById(assignedResponseId).orElseThrow();
        var acceptance = acceptanceRepository.findByResponseIdAndRevokedAtIsNull(assignedResponseId).orElseThrow();
        acceptance.reactivate(acceptance.getAcceptedBySubject(), acceptance.getAcceptedByEmail(),
            acceptance.getAcceptedByRole(), response.getUpdatedAt().minusSeconds(1), acceptance.getAcceptedAt());
        acceptanceRepository.saveAndFlush(acceptance);

        org.assertj.core.api.Assertions.assertThat(archiveRepository.findByResponseIdAndSourceResponseUpdatedAt(
            assignedResponseId, response.getUpdatedAt())).isPresent();
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString())
                .cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.archivedResponseIds").isEmpty());
    }

    @Test
    void staleTabReturnsConflictInsteadOfOverwritingTheNewerResponse() throws Exception {
        var response = responseRepository.findById(assignedResponseId).orElseThrow();
        String token = sessionTokenFor("sub-student-a", "a@gmail.com");
        String payload = "{\"deliverableId\":\"" + response.getDeliverableId() + "\",\"revision\":" + response.getRevision()
            + ",\"valuesJson\":\"{\\\"value\\\":\\\"newer\\\"}\"}";
        mockMvc.perform(post("/api/workspace/responses/submit").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)).with(csrf()).contentType("application/json").content(payload))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/workspace/responses/submit").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)).with(csrf()).contentType("application/json").content(payload.replace("newer", "stale")))
            .andExpect(status().isConflict());
    }

    @Test
    void dashboardComposesOwnedDataAndRedactsDuplicateClaimants() throws Exception {
        var original = responseRepository.findById(assignedResponseId).orElseThrow();
        associationService.confirmAssociation(workspaceId, "duplicate-subject", "duplicate@gmail.com", original.getStudentNumber());
        responseService.submit(new FormResponseService.SubmitCommand(workspaceId, original.getDeliverableId(),
            "duplicate-subject", "duplicate@gmail.com", Map.of("driveLink", "https://private.example/duplicate")));
        String admin = sessionTokenFor("dashboard-admin", "dashboard-admin@school.edu", StaffRole.ADMIN);
        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/feedback")
                .cookie(sessionCookie(admin)).with(csrf()).contentType("application/json")
                .content("{\"note\":\"Private staff note\",\"visibility\":\"Staff\"}"))
            .andExpect(status().isOk());
        String token = sessionTokenFor("sub-student-a", "a@gmail.com");
        mockMvc.perform(get("/api/workspace/students/dashboard").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.association.studentNumber").value(original.getStudentNumber()))
            .andExpect(jsonPath("$.students.length()").value(1))
            .andExpect(jsonPath("$.responses.length()").value(2))
            .andExpect(jsonPath("$.responses[?(@.owned == false)].valuesJson").value(org.hamcrest.Matchers.contains("")))
            .andExpect(jsonPath("$.responses[?(@.owned == false)].googleEmail").value(org.hamcrest.Matchers.contains("")))
            .andExpect(jsonPath("$.reviewStates['" + assignedResponseId + "'].feedback.length()").value(0))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string(
                org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("https://private.example/duplicate"))));
        associationService.disconnect(workspaceId, "sub-student-a");
        mockMvc.perform(get("/api/workspace/students/dashboard").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.students.length()").value(0))
            .andExpect(jsonPath("$.responses.length()").value(1))
            .andExpect(jsonPath("$.responses[0].id").value(assignedResponseId.toString()));
    }

    @Test
    void dashboardRequiresSessionAndDoesNotLeakAnotherWorkspace() throws Exception {
        mockMvc.perform(get("/api/workspace/students/dashboard").param("workspaceId", workspaceId.toString()))
            .andExpect(status().isUnauthorized());
        var other = workspaceRepository.save(new AcademicWorkspace("CS dashboard", "CS", "CS332", "Semester 2", "2026-27", true));
        mockMvc.perform(get("/api/workspace/students/dashboard").param("workspaceId", other.getId().toString())
                .cookie(sessionCookie(sessionTokenFor("sub-student-a", "a@gmail.com"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.responses.length()").value(0))
            .andExpect(jsonPath("$.students.length()").value(0));
    }

    @Test
    void dashboardKeepsSubmittedDeliverablesAfterUnpublishingWithoutExposingOtherUnpublishedForms() throws Exception {
        var response = responseRepository.findById(assignedResponseId).orElseThrow();
        var submittedForm = deliverableRepository.findById(response.getDeliverableId()).orElseThrow();
        submittedForm.setStatus(DeliverableStatus.UNPUBLISHED);
        deliverableRepository.save(submittedForm);
        deliverableRepository.save(new Deliverable(workspaceId, "PRIVATE", "Unreleased form", "unreleased-form",
            "Not published", LocalDateTime.parse("2026-12-18T23:59:00"), false, DeliverableStatus.UNPUBLISHED));
        String token = sessionTokenFor("sub-student-a", "a@gmail.com");
        mockMvc.perform(get("/api/workspace/students/dashboard").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(token)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deliverables.length()").value(1))
            .andExpect(jsonPath("$.deliverables[0].id").value(submittedForm.getId().toString()))
            .andExpect(jsonPath("$.deliverables[0].status").value("UNPUBLISHED"));
    }

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
        // HTTP requests in production read committed timestamps at database precision.
        entityManager.flush();
        entityManager.clear();
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
    void studentCannotReadStaffOnlyFeedbackOnTheirOwnResponse() throws Exception {
        String adminToken = sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN);
        mockMvc.perform(post("/api/workspace/responses/" + assignedResponseId + "/feedback")
                .cookie(sessionCookie(adminToken))
                .contentType("application/json")
                .content("{\"note\":\"Internal review note.\",\"visibility\":\"Staff\"}")
                .with(csrf()))
            .andExpect(status().isOk());

        String studentToken = sessionTokenFor("sub-student-a", "a@gmail.com");
        mockMvc.perform(get("/api/workspace/responses/" + assignedResponseId + "/feedback")
                .cookie(sessionCookie(studentToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isEmpty());
        mockMvc.perform(get("/api/workspace/responses/" + assignedResponseId + "/review-state")
                .cookie(sessionCookie(studentToken)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.feedback").isEmpty());
    }

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(get("/api/workspace/responses/" + assignedResponseId + "/feedback"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void monitoringAndStaffScopeRestrictAdviserToAssignedWorkspaceTeams() throws Exception {
        Cookie cookie = sessionCookie(adviserAssignedToOneTeam());
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString()).cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allTeams").value(false))
            .andExpect(jsonPath("$.students.length()").value(1))
            .andExpect(jsonPath("$.students[0].teamCode").value(ASSIGNED_TEAM))
            .andExpect(jsonPath("$.responses.length()").value(1))
            .andExpect(jsonPath("$.responses[0].id").value(assignedResponseId.toString()));
        mockMvc.perform(get("/api/workspace/responses/staff-scope")
                .param("workspaceId", workspaceId.toString()).cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.responses.length()").value(1));
        var otherWorkspace = workspaceRepository.save(new AcademicWorkspace(
            "Other", "CS", "CS332", "Semester 2", "2026-27", true));
        studentRecordRepository.save(new StudentRecord(otherWorkspace.getId(), "other-number", "Other",
            ASSIGNED_TEAM, "1", ASSIGNED_TEAM, "Adviser", null, 1));
        mockMvc.perform(get("/api/monitoring").param("workspaceId", otherWorkspace.getId().toString()).cookie(cookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.teamCodes").isEmpty())
            .andExpect(jsonPath("$.students").isEmpty())
            .andExpect(jsonPath("$.responses").isEmpty());
    }

    @Test
    void monitoringRejectsStudentsAndAnonymousAndAllowsAdmin() throws Exception {
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString()))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(sessionTokenFor("sub-student-a", "a@gmail.com"))))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/monitoring").param("workspaceId", workspaceId.toString())
                .cookie(sessionCookie(sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allTeams").value(true))
            .andExpect(jsonPath("$.responses.length()").value(2));
    }

    private void accept(UUID responseId) {
        var response = responseRepository.findById(responseId).orElseThrow();
        acceptanceRepository.save(new ResponseAcceptance(UUID.randomUUID(), response, "sub-admin",
            "admin@school.edu", "ADMIN", response.getUpdatedAt(), Instant.now()));
    }

    @Test
    void archiveRequiresAdminAndCsrfAndValidIds() throws Exception {
        String body = "{\"responseIds\":[\"" + assignedResponseId + "\"]}";
        Cookie adviser = sessionCookie(adviserAssignedToOneTeam());
        mockMvc.perform(get("/api/archive").param("workspaceId", workspaceId.toString()).cookie(adviser))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString()).cookie(adviser)
                .with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isForbidden());
        Cookie admin = sessionCookie(sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN));
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString()).cookie(admin)
                .contentType("application/json").content(body))
            .andExpect(status().isForbidden());
        for (String invalid : new String[]{"{\"responseIds\":[]}", "{\"responseIds\":[null]}"}) {
            mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString()).cookie(admin)
                    .with(csrf()).contentType("application/json").content(invalid))
                .andExpect(status().isBadRequest());
        }
    }

    @Test
    void archiveIsIdempotentAndWorkspaceScopedAndRejectsStaleAcceptance() throws Exception {
        accept(assignedResponseId);
        Cookie admin = sessionCookie(sessionTokenFor("sub-admin", "admin@school.edu", StaffRole.ADMIN));
        String body = "{\"responseIds\":[\"" + assignedResponseId + "\"]}";
        for (int i = 0; i < 2; i++) {
            mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString()).cookie(admin)
                    .with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].version").value("v1"))
                .andExpect(jsonPath("$[0].verified").value(false));
        }
        org.assertj.core.api.Assertions.assertThat(archiveRepository.countByResponseId(assignedResponseId)).isEqualTo(1);
        UUID otherWorkspace = UUID.randomUUID();
        mockMvc.perform(get("/api/archive").param("workspaceId", otherWorkspace.toString()).cookie(admin))
            .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        mockMvc.perform(post("/api/archive").param("workspaceId", otherWorkspace.toString()).cookie(admin)
                .with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isBadRequest());
        var response = responseRepository.findById(assignedResponseId).orElseThrow();
        response.setUpdatedAt(response.getUpdatedAt().plusSeconds(1));
        responseRepository.saveAndFlush(response);
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString()).cookie(admin)
                .with(csrf()).contentType("application/json").content(body))
            .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/archive").param("workspaceId", workspaceId.toString()).cookie(admin)
                .with(csrf()).contentType("application/json")
                .content("{\"responseIds\":[\"" + otherResponseId + "\"]}"))
            .andExpect(status().isBadRequest());
    }
}
