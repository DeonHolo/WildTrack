package com.capvault.backend.workspace;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;

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
class AcademicWorkspaceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;
    @Autowired private com.capvault.backend.auth.WildTrackSessionService sessions;
    @Autowired private com.capvault.backend.staff.StaffRoleAssignmentRepository roles;

    private jakarta.servlet.http.Cookie adminCookie() {
        String subject = "catalog-admin-" + java.util.UUID.randomUUID();
        var now = java.time.Instant.now();
        roles.saveAndFlush(new com.capvault.backend.staff.StaffRoleAssignment(java.util.UUID.randomUUID(), subject,
            "catalog-admin@example.invalid", com.capvault.backend.staff.StaffRole.ADMIN, true, now, now));
        var login = sessions.create(new com.capvault.backend.auth.GoogleIdentity(subject, "catalog-admin@example.invalid", "Admin", ""));
        return new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", login.rawToken());
    }

    private jakarta.servlet.http.Cookie studentCookie() {
        var login = sessions.create(new com.capvault.backend.auth.GoogleIdentity("catalog-unlinked-" + java.util.UUID.randomUUID(),
            "catalog-unlinked@example.invalid", "Unlinked", ""));
        return new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", login.rawToken());
    }

    @Test
    void listsSeededWorkspacesAndCreatesAnotherAcademicContext() throws Exception {
        mockMvc.perform(get("/api/workspaces").cookie(adminCookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()", greaterThanOrEqualTo(2)))
            .andExpect(jsonPath("$[?(@.courseCode == 'IT332')]").exists());

        mockMvc.perform(post("/api/workspaces").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Information Systems Capstone - IS401 - Semester 1 2026-27",
                      "program": "IS",
                      "courseCode": "IS401",
                      "semester": "Semester 1",
                      "academicYear": "2026-27",
                      "active": true
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.program").value("IS"))
            .andExpect(jsonPath("$.courseCode").value("IS401"));
    }

    @Test
    void unlinkedAccountCannotBrowseRosterOrWorkspaceCatalogue() throws Exception {
        var login = sessions.create(new com.capvault.backend.auth.GoogleIdentity("unlinked-catalog-test", "unlinked@example.invalid", "Unlinked", ""));
        var cookie = new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", login.rawToken());
        mockMvc.perform(get("/api/workspaces").cookie(cookie))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/students").cookie(cookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/tracker/rows").cookie(cookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/tracker/columns").cookie(cookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/tracker/writebacks").cookie(cookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/projects").cookie(cookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/monitoring").cookie(cookie).param("workspaceId", "11111111-1111-1111-1111-111111111111"))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/deliverables").cookie(cookie)).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/deliverables/" + java.util.UUID.randomUUID()).cookie(cookie)).andExpect(status().isForbidden());
        for (String route : java.util.List.of("/api/academic-data", "/api/archive", "/api/workspace/students/dashboard",
                "/api/templates", "/api/sheets/import-runs", "/api/workspace/sources", "/api/workspace/responses/staff")) {
            mockMvc.perform(get(route).param("workspaceId", "11111111-1111-1111-1111-111111111111").cookie(cookie))
                .andExpect(status().isForbidden());
        }
        mockMvc.perform(get("/api/workspace/students/options")
                .param("workspaceId", "11111111-1111-1111-1111-111111111111").cookie(cookie))
            .andExpect(status().isForbidden());
        sessions.revoke(login.rawToken());
    }

    @Test
    void archivesAndRestoresWorkspaceWithoutExposingArchivedRowsToNormalCatalogs() throws Exception {
        String created = mockMvc.perform(post("/api/workspaces").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Lifecycle Test Workspace",
                      "program": "LIFE",
                      "courseCode": "LIFE-ARCHIVE-01",
                      "semester": "Semester 1",
                      "academicYear": "2098-99",
                      "active": true
                    }
                    """))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        String id = objectMapper.readTree(created).get("id").asText();

        mockMvc.perform(put("/api/workspaces/{id}", id).with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Lifecycle Test Workspace",
                      "program": "LIFE",
                      "courseCode": "LIFE-ARCHIVE-01",
                      "semester": "Semester 1",
                      "academicYear": "2098-99",
                      "active": false
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.active").value(false));

        mockMvc.perform(get("/api/workspaces").cookie(studentCookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == '%s')]".formatted(id)).doesNotExist());

        mockMvc.perform(get("/api/workspaces?includeArchived=true").with(session()))
            .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/workspaces?includeArchived=true").cookie(adminCookie()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == '%s' && @.active == false)]".formatted(id)).exists());

        mockMvc.perform(put("/api/workspaces/{id}", id).with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Lifecycle Test Workspace Restored",
                      "program": "LIFE",
                      "courseCode": "LIFE-ARCHIVE-01",
                      "semester": "Semester 1",
                      "academicYear": "2098-99",
                      "active": true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.active").value(true))
            .andExpect(jsonPath("$.name").value("Lifecycle Test Workspace Restored"));
    }

    @Test
    void updateRejectsDuplicateAcademicIdentityWithFriendlyValidation() throws Exception {
        String first = createWorkspace("Duplicate Identity A", "DUP", "DUP-A", "2097-98");
        String second = createWorkspace("Duplicate Identity B", "DUP", "DUP-B", "2097-98");

        mockMvc.perform(put("/api/workspaces/{id}", second).with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Duplicate Identity B",
                      "program": "dup",
                      "courseCode": "dup-a",
                      "semester": "Semester 1",
                      "academicYear": "2097-98",
                      "active": true
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("A workspace already exists for this program, course, semester, and academic year."));
    }

    private String createWorkspace(String name, String program, String courseCode, String academicYear) throws Exception {
        String response = mockMvc.perform(post("/api/workspaces").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "%s",
                      "program": "%s",
                      "courseCode": "%s",
                      "semester": "Semester 1",
                      "academicYear": "%s",
                      "active": true
                    }
                    """.formatted(name, program, courseCode, academicYear)))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("id").asText();
    }
}
