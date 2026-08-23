package com.capvault.backend.deliverable;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
class DeliverableControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DeliverableRepository repository;

    @Test
    void createUpdateAndListDeliverables() throws Exception {
        repository.deleteAll();

        String createdJson = mockMvc.perform(post("/api/deliverables").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "SRS",
                      "title": "SRS Submission",
                      "slug": "Week 9 SRS",
                      "instructions": "Submit a PDF Drive link.",
                      "dueAt": "2026-04-18T23:59:00",
                      "pdfRequired": true,
                      "status": "PUBLISHED"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.trackerColumnKey").value("SRS"))
            .andExpect(jsonPath("$.slug").value("week-9-srs"))
            .andExpect(jsonPath("$.pdfRequired").value(true))
            .andReturn()
            .getResponse()
            .getContentAsString();

        String id = createdJson.replaceAll(".*\\\"id\\\":\\\"([^\\\"]+)\\\".*", "$1");

        mockMvc.perform(put("/api/deliverables/" + id).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "SRS",
                      "title": "Updated SRS Submission",
                      "slug": "updated-srs-submission",
                      "instructions": "Submit the final PDF Drive link.",
                      "dueAt": "2026-04-19T23:59:00",
                      "pdfRequired": true,
                      "status": "UNPUBLISHED"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Updated SRS Submission"))
            .andExpect(jsonPath("$.status").value("UNPUBLISHED"));

        mockMvc.perform(get("/api/deliverables"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].slug").value("updated-srs-submission"));
    }

    @Test
    void createDeliverableRejectsMissingRequiredFields() throws Exception {
        mockMvc.perform(post("/api/deliverables").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "title": "",
                      "pdfRequired": true
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fieldErrors.trackerColumnKey").value("Tracker column is required"))
            .andExpect(jsonPath("$.fieldErrors.title").value("Title is required"))
            .andExpect(jsonPath("$.fieldErrors.dueAt").value("Due date is required"));
    }
}


