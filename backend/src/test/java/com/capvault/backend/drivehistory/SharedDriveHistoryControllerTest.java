package com.capvault.backend.drivehistory;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.drivehistory.auth.DelegatedDriveAccessService;
import com.capvault.backend.drivehistory.auth.DelegatedDriveGateway;
import com.capvault.backend.drivehistory.auth.DriveRevisionMetadata;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
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
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SharedDriveHistoryControllerTest {
    @Autowired private MockMvc mvc;
    @Autowired private WildTrackSessionService sessions;
    @Autowired private AcademicWorkspaceRepository workspaces;
    @Autowired private DeliverableRepository deliverables;
    @Autowired private FormResponseRepository responses;
    @Autowired private StudentRecordRepository studentRecords;
    @Autowired private StudentAssociationService associations;
    @Autowired private StaffRoleAssignmentRepository staffRoles;
    @MockBean private DelegatedDriveAccessService authorization;
    @MockBean private DelegatedDriveGateway drive;

    private UUID workspaceId;
    private UUID responseId;

    @BeforeEach
    void setup() {
        workspaceId = workspaces.save(new AcademicWorkspace("History IT411", "IT", "IT411",
            "Semester 1", "2026-27", true)).getId();
        UUID deliverableId = deliverables.save(new Deliverable(workspaceId, "Refactored SRS",
            "Refactored SRS", "refactored-srs", "Submit a PDF.",
            LocalDateTime.parse("2026-09-20T23:59:00"), true, DeliverableStatus.PUBLISHED)).getId();
        saveSubmission(deliverableId, "a-student", "a@example.com", "23-0001", "TEAM-A",
            "https://drive.google.com/file/d/same-PDF-123/view");
        saveSubmission(deliverableId, "b-owner", "b@example.com", "23-0002", "TEAM-B",
            "https://drive.google.com/open?id=same-PDF-123");
        when(authorization.isConfigured()).thenReturn(true);
        when(authorization.connected("b-owner")).thenReturn(true);
        when(authorization.accessTokenForSubject("b-owner")).thenReturn(Optional.of("secret"));
        when(drive.revisions(eq("secret"), eq("same-PDF-123"), nullable(String.class), eq(50)))
            .thenReturn(new DelegatedDriveGateway.Page(List.of(new DriveRevisionMetadata(
                "rev-4", "2026-09-18T00:00:00Z", "application/pdf", "100", true,
                "Actual Drive Editor", "private-editor@example.com")), null));
        when(drive.fileMetadata("secret", "same-PDF-123")).thenReturn(
            new DelegatedDriveGateway.FileDetails("2026-08-01T00:00:00Z", "Private Drive Owner",
                "2026-09-18T00:00:00Z", "Private File Modifier"));
    }

    private void saveSubmission(UUID deliverableId, String subject, String email,
                                String number, String team, String link) {
        StudentRecord student = studentRecords.save(new StudentRecord(
            workspaceId, number, "STUDENT " + number, team, "1", team, "Adviser", null, 1));
        associations.confirmAssociation(workspaceId, subject, email, number);
        FormResponse response = responses.saveAndFlush(new FormResponse(
            UUID.randomUUID(), workspaceId, deliverableId, subject, email,
            student.getId(), number, "STUDENT " + number, team,
            "{\"documentPdf\":\"" + link + "\"}", Instant.now(), Instant.now()));
        if ("a-student".equals(subject)) responseId = response.getId();
    }

    private Cookie session(String subject, String email, StaffRole... roles) {
        for (StaffRole role : roles) staffRoles.save(new StaffRoleAssignment(
            UUID.randomUUID(), subject, email, role, true, Instant.now(), Instant.now()));
        String raw = sessions.create(new GoogleIdentity(subject, email, "Tester", null)).rawToken();
        return new Cookie("WILDTRACK_SESSION", raw);
    }

    @Test
    void sharedFileRevisionEvidenceAppearsForExistingSubmitterWithoutEditorIdentity() throws Exception {
        mvc.perform(get("/api/drive-history").param("workspaceId", workspaceId.toString())
                .param("responseId", responseId.toString())
                .cookie(session("a-student", "a@example.com")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("AVAILABLE"))
            .andExpect(jsonPath("$.sourceFileId").value("same-PDF-123"))
            .andExpect(jsonPath("$.revisions[0].id").value("rev-4"))
            .andExpect(jsonPath("$.revisions[0].modifiedBy").isEmpty())
            .andExpect(jsonPath("$.revisions[0].modifiedByEmail").isEmpty())
            .andExpect(jsonPath("$.fileMetadata.createdTime").value("2026-08-01T00:00:00Z"))
            .andExpect(jsonPath("$.fileMetadata.driveOwner").isEmpty());
    }

    @Test
    void onlyAuthorizedStaffCanReadSharedEditorIdentity() throws Exception {
        mvc.perform(get("/api/drive-history").param("workspaceId", workspaceId.toString())
                .param("responseId", responseId.toString())
                .cookie(session("admin-subject", "admin@example.com", StaffRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.revisions[0].modifiedByEmail").value("private-editor@example.com"))
            .andExpect(jsonPath("$.fileMetadata.driveOwner").value("Private Drive Owner"));

        mvc.perform(get("/api/drive-history").param("workspaceId", workspaceId.toString())
                .param("responseId", responseId.toString())
                .cookie(session("unrelated-subject", "unrelated@example.com")))
            .andExpect(status().isForbidden());
    }
}
