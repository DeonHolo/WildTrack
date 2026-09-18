package com.capvault.backend.deliverable;

import java.time.LocalDateTime;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.capvault.backend.workspace.AcademicWorkspace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
class DeliverableControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DeliverableRepository repository;

    @Test
    void createUpdateAndListDeliverables() throws Exception {
        repository.deleteAll();

        String createdJson = mockMvc.perform(post("/api/deliverables").with(adminSession())
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

        JsonNode created = new ObjectMapper().readTree(createdJson);
        String id = created.path("id").asText();
        String updatedAt = created.path("updatedAt").asText();

        mockMvc.perform(put("/api/deliverables/" + id).with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "SRS",
                      "title": "Updated SRS Submission",
                      "slug": "week-9-srs",
                      "instructions": "Submit the final PDF Drive link.",
                      "dueAt": "2026-04-19T23:59:00",
                      "pdfRequired": true,
                      "status": "UNPUBLISHED",
                      "expectedUpdatedAt": "%s"
                    }
                    """.formatted(updatedAt)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.title").value("Updated SRS Submission"))
            .andExpect(jsonPath("$.status").value("UNPUBLISHED"))
            .andExpect(jsonPath("$.slug").value("week-9-srs"))
            .andExpect(jsonPath("$.updatedAt").isNotEmpty());

        mockMvc.perform(get("/api/deliverables").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].slug").value("week-9-srs"));
    }

    @Test
    void updateRejectsSlugChangesAndStaleExpectedTimestamp() throws Exception {
        repository.deleteAll();
        String createdJson = mockMvc.perform(post("/api/deliverables").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "SRS",
                      "title": "SRS Submission",
                      "slug": "stable-srs",
                      "instructions": "Submit SRS.",
                      "dueAt": "2026-04-18T23:59:00",
                      "pdfRequired": false,
                      "status": "PUBLISHED"
                    }
                    """))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        JsonNode created = new ObjectMapper().readTree(createdJson);
        String id = created.path("id").asText();
        String initialUpdatedAt = created.path("updatedAt").asText();

        mockMvc.perform(put("/api/deliverables/" + id).with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "SRS",
                      "title": "SRS Submission",
                      "slug": "changed-srs",
                      "instructions": "Submit SRS.",
                      "dueAt": "2026-04-18T23:59:00",
                      "pdfRequired": false,
                      "status": "PUBLISHED",
                      "expectedUpdatedAt": "%s"
                    }
                    """.formatted(initialUpdatedAt)))
            .andExpect(status().isBadRequest());

        mockMvc.perform(put("/api/deliverables/" + id).with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "SRS",
                      "title": "SRS v2",
                      "slug": "stable-srs",
                      "instructions": "Submit SRS.",
                      "dueAt": "2026-04-18T23:59:00",
                      "pdfRequired": false,
                      "status": "PUBLISHED",
                      "expectedUpdatedAt": "%s"
                    }
                    """.formatted(initialUpdatedAt)))
            .andExpect(status().isOk());

        mockMvc.perform(put("/api/deliverables/" + id).with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "SRS",
                      "title": "stale edit",
                      "slug": "stable-srs",
                      "instructions": "Submit SRS.",
                      "dueAt": "2026-04-18T23:59:00",
                      "pdfRequired": false,
                      "status": "PUBLISHED",
                      "expectedUpdatedAt": "%s"
                    }
                    """.formatted(initialUpdatedAt)))
            .andExpect(status().isConflict());
    }

    @Test
    void createDeliverableRejectsMissingRequiredFields() throws Exception {
        mockMvc.perform(post("/api/deliverables").with(adminSession())
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

    @Test
    void createExposesConfigurableQuestionMetadataAndStableOptionIds() throws Exception {
        repository.deleteAll();

        mockMvc.perform(post("/api/deliverables").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "trackerColumnKey": "MVP",
                      "title": "MVP Feedback",
                      "slug": "mvp-feedback",
                      "instructions": "Answer the form.",
                      "dueAt": "2026-04-18T23:59:00",
                      "pdfRequired": false,
                      "status": "PUBLISHED",
                      "fields": [
                        {
                          "fieldKey": "studentNumber",
                          "label": "Student Number",
                          "helpText": "From your connected Student Record.",
                          "fieldType": "ACADEMIC_STUDENT_NUMBER",
                          "required": true,
                          "displayOrder": 0,
                          "documentCheckPolicy": "OFF",
                          "aiReviewEnabled": false,
                          "active": true,
                          "options": []
                        },
                        {
                          "fieldKey": "workflowState",
                          "label": "Workflow state",
                          "helpText": "Choose one.",
                          "fieldType": "DROPDOWN",
                          "required": true,
                          "displayOrder": 1,
                          "documentCheckPolicy": "OFF",
                          "aiReviewEnabled": false,
                          "active": true,
                          "options": [
                            {"id": "draft-ready", "label": "Ready"},
                            {"label": "Needs revision"}
                          ]
                        }
                      ]
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.updatedAt").isNotEmpty())
            .andExpect(jsonPath("$.fields[0].fieldType").value("ACADEMIC_STUDENT_NUMBER"))
            .andExpect(jsonPath("$.fields[0].helpText").value("From your connected Student Record."))
            .andExpect(jsonPath("$.fields[1].fieldType").value("DROPDOWN"))
            .andExpect(jsonPath("$.fields[1].options", hasSize(2)))
            .andExpect(jsonPath("$.fields[1].options[0].label").value("Ready"))
            .andExpect(jsonPath("$.fields[1].options[0].id").isNotEmpty())
            .andExpect(jsonPath("$.fields[1].options[0].id").value(org.hamcrest.Matchers.not("draft-ready")));
    }

    @Test
    void adminCanUnpublishEveryPublishedDeliverableInOneServerSideBatch() throws Exception {
        repository.deleteAll();
        UUID otherWorkspaceId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        repository.save(new Deliverable(
            AcademicWorkspace.DEFAULT_IT_ID,
            "SRS",
            "SRS Submission",
            "srs-submission",
            "Submit SRS.",
            LocalDateTime.of(2026, 4, 18, 23, 59),
            true,
            DeliverableStatus.PUBLISHED
        ));
        repository.save(new Deliverable(
            AcademicWorkspace.DEFAULT_IT_ID,
            "SDD",
            "SDD Submission",
            "sdd-submission",
            "Submit SDD.",
            LocalDateTime.of(2026, 4, 25, 23, 59),
            true,
            DeliverableStatus.PUBLISHED
        ));
        repository.save(new Deliverable(
            otherWorkspaceId,
            "RFL",
            "Other Workspace RFL",
            "other-rfl",
            "Submit RFL.",
            LocalDateTime.of(2026, 4, 30, 23, 59),
            true,
            DeliverableStatus.PUBLISHED
        ));

        mockMvc.perform(post("/api/deliverables/unpublish-all").with(adminSession()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].status").value("UNPUBLISHED"))
            .andExpect(jsonPath("$[1].status").value("UNPUBLISHED"));

        assertThat(repository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(AcademicWorkspace.DEFAULT_IT_ID))
            .allSatisfy(deliverable -> assertThat(deliverable.getStatus()).isEqualTo(DeliverableStatus.UNPUBLISHED));
        assertThat(repository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(otherWorkspaceId))
            .singleElement()
            .extracting(Deliverable::getStatus)
            .isEqualTo(DeliverableStatus.PUBLISHED);
    }

    @Test
    void anonymousVisitorsCanReadAPublishedFormFromItsPublicUrl() throws Exception {
        repository.deleteAll();
        repository.save(new Deliverable(
            AcademicWorkspace.DEFAULT_IT_ID,
            "RFL",
            "RFL Submission",
            "rfl-submission",
            "Submit your RFL document.",
            LocalDateTime.of(2026, 4, 18, 23, 59),
            true,
            DeliverableStatus.PUBLISHED
        ));

        mockMvc.perform(get("/api/public/forms/it-it332-2025-26-semester-2/rfl-submission"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.workspace.id").value(AcademicWorkspace.DEFAULT_IT_ID.toString()))
            .andExpect(jsonPath("$.deliverable.slug").value("rfl-submission"))
            .andExpect(jsonPath("$.deliverable.status").value("PUBLISHED"));
    }
}
