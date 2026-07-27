package com.capvault.backend.filecheck;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "capvault.google.drive.enabled=false",
    "capvault.google.drive.api-key="
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class FileCheckControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FileCheckReportRepository repository;

    @BeforeEach
    void clearReports() {
        repository.deleteAll();
    }

    @Test
    void reportsHonestUnconfiguredStateAndPersistsAttempt() throws Exception {
        mockMvc.perform(get("/api/file-checks/status"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.configured").value(false))
            .andExpect(jsonPath("$.message").value(
                "Google Drive API is not configured. Run setup-local.ps1 and restart the backend."
            ));

        mockMvc.perform(post("/api/file-checks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "responseId": "response-001",
                      "deliverableKey": "SRS",
                      "sourceUrl": "https://drive.google.com/file/d/public-file-id/view",
                      "sourceResponseUpdatedAt": "2026-07-27T09:30:00+08:00"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("UNAVAILABLE"))
            .andExpect(jsonPath("$.flags", hasItem("Not Checked")))
            .andExpect(jsonPath("$.summary").value(
                "Google Drive API is not configured on this machine."
            ));

        mockMvc.perform(get("/api/file-checks/response-001"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.responseId").value("response-001"))
            .andExpect(jsonPath("$.status").value("UNAVAILABLE"));
    }
}
