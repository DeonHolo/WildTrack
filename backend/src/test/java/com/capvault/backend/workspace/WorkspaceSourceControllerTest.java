package com.capvault.backend.workspace;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.capvault.backend.sheets.SheetImportRunRepository;
import org.junit.jupiter.api.Test;
import static com.capvault.backend.support.AuthenticatedRequest.adminSession;
import static com.capvault.backend.support.AuthenticatedRequest.session;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkspaceSourceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private WorkspaceSourceRepository repository;

    @Autowired
    private SheetImportRunRepository sheetImportRunRepository;
    @Autowired private com.capvault.backend.auth.WildTrackSessionService sessions;
    @Autowired private com.capvault.backend.staff.StaffRoleAssignmentRepository roles;

    @Test
    void upsertSourceStoresGoogleSheetMetadata() throws Exception {
        sheetImportRunRepository.deleteAll();
        repository.deleteAll();

        mockMvc.perform(put("/api/workspace/sources/TEAM_FORMATION").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": "https://docs.google.com/spreadsheets/d/1zret-lQpRtezO1v4fBPNyqw5nenhEIXV2BQXu2raGFk/edit?gid=1639014359",
                      "displayName": "Team Formation",
                      "status": "IMPORTED"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sourceType").value("TEAM_FORMATION"))
            .andExpect(jsonPath("$.sheetId").value("1zret-lQpRtezO1v4fBPNyqw5nenhEIXV2BQXu2raGFk"))
            .andExpect(jsonPath("$.displayName").value("Team Formation"))
            .andExpect(jsonPath("$.status").value("IMPORTED"));

        String suffix = java.util.UUID.randomUUID().toString();
        var student = sessions.create(new com.capvault.backend.auth.GoogleIdentity("source-student-" + suffix, "student@example.invalid", "Student", ""));
        var adminSubject = "source-admin-" + suffix;
        var now = java.time.Instant.now();
        roles.saveAndFlush(new com.capvault.backend.staff.StaffRoleAssignment(java.util.UUID.randomUUID(), adminSubject,
            "admin@example.invalid", com.capvault.backend.staff.StaffRole.ADMIN, true, now, now));
        var admin = sessions.create(new com.capvault.backend.auth.GoogleIdentity(adminSubject, "admin@example.invalid", "Admin", ""));
        mockMvc.perform(get("/api/workspace/sources").cookie(new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", student.rawToken())))
            .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/workspace/sources").cookie(new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", admin.rawToken())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].sourceType").value("TEAM_FORMATION"));
        sessions.revoke(student.rawToken());
        sessions.revoke(admin.rawToken());
    }

    @Test
    void upsertSourceRejectsBlankUrl() throws Exception {
        mockMvc.perform(put("/api/workspace/sources/TRACKER").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "sheetUrl": ""
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.sheetUrl").value("Sheet URL is required"));
    }
}

