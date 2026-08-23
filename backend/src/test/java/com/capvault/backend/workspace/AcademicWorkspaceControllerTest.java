package com.capvault.backend.workspace;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
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

    @Test
    void listsSeededWorkspacesAndCreatesAnotherAcademicContext() throws Exception {
        mockMvc.perform(get("/api/workspaces"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()", greaterThanOrEqualTo(2)))
            .andExpect(jsonPath("$[?(@.courseCode == 'IT332')]").exists());

        mockMvc.perform(post("/api/workspaces").with(csrf())
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
}


