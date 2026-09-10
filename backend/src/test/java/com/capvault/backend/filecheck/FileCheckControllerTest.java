package com.capvault.backend.filecheck;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static com.capvault.backend.support.AuthenticatedRequest.session;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;

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

    @Autowired
    private DeliverableRepository deliverableRepository;

    @Autowired
    private DeliverableFieldRepository fieldRepository;

    @Autowired
    private FormResponseRepository responseRepository;

    @BeforeEach
    void clearReports() {
        repository.deleteAll();
    }

    @Test
    void absentDocumentCheckReturnsNotFound() throws Exception {
        mockMvc.perform(get("/api/file-checks/not-checked-yet").with(session()))
            .andExpect(status().isNotFound());
    }

    @Test
    void reportsHonestUnconfiguredStateAndPersistsAttempt() throws Exception {
        mockMvc.perform(get("/api/file-checks/status").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.configured").value(false))
            .andExpect(jsonPath("$.message").value(
                "Google Drive API is not configured. Run setup-local.ps1 and restart the backend."
            ));

        mockMvc.perform(post("/api/file-checks").with(session())
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

        mockMvc.perform(get("/api/file-checks/response-001").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.responseId").value("response-001"))
            .andExpect(jsonPath("$.status").value("UNAVAILABLE"));
    }

    @Test
    void keepsReportsIndependentPerPdfArtifactAndLegacyLookupDoesNotLeakFieldReports() throws Exception {
        UUID workspaceId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        String deliverableKey = "MVP Validation " + UUID.randomUUID();
        Deliverable deliverable = deliverableRepository.save(new Deliverable(
            workspaceId,
            deliverableKey,
            "MVP Validation",
            "mvp-validation-" + UUID.randomUUID(),
            "Submit all validation artifacts.",
            LocalDateTime.now().plusDays(7),
            true,
            DeliverableStatus.PUBLISHED
        ));
        String frameworkFieldId = "framework-" + UUID.randomUUID();
        String highlightsFieldId = "highlights-" + UUID.randomUUID();
        fieldRepository.saveAll(List.of(
            pdfField(frameworkFieldId, deliverable, "frameworkModel", "Framework / Model", 0),
            pdfField(highlightsFieldId, deliverable, "validationHighlights", "MVP Validation Highlights", 1)
        ));

        UUID responseUuid = UUID.randomUUID();
        String responseId = responseUuid.toString();
        String frameworkUrl = "https://drive.google.com/file/d/framework-file-id/view";
        String highlightsUrl = "https://drive.google.com/file/d/highlights-file-id/view";
        responseRepository.save(response(
            responseUuid,
            workspaceId,
            deliverable.getId(),
            "{\"frameworkModel\":\"" + frameworkUrl + "\",\"validationHighlights\":\"" + highlightsUrl + "\"}"
        ));

        createUnavailableCheck(responseId, deliverableKey, frameworkFieldId, frameworkUrl);
        createUnavailableCheck(responseId, deliverableKey, highlightsFieldId, highlightsUrl);

        mockMvc.perform(get("/api/file-checks/" + responseId)
                .param("fieldId", frameworkFieldId)
                .with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fieldId").value(frameworkFieldId))
            .andExpect(jsonPath("$.sourceUrl").value(frameworkUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId)
                .param("fieldId", highlightsFieldId)
                .with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fieldId").value(highlightsFieldId))
            .andExpect(jsonPath("$.sourceUrl").value(highlightsUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId + "/history")
                .param("fieldId", frameworkFieldId)
                .with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].fieldId").value(frameworkFieldId))
            .andExpect(jsonPath("$[0].sourceUrl").value(frameworkUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId + "/history")
                .param("fieldId", highlightsFieldId)
                .with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].fieldId").value(highlightsFieldId))
            .andExpect(jsonPath("$[0].sourceUrl").value(highlightsUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId).with(session()))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/file-checks/" + responseId + "/history").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void rejectsFieldSpecificChecksThatDoNotMatchStoredResponseAssociation() throws Exception {
        UUID workspaceId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        Deliverable deliverable = deliverableRepository.save(new Deliverable(
            workspaceId,
            "MVP Validation",
            "MVP Validation",
            "mvp-validation-association-" + UUID.randomUUID(),
            "Submit all validation artifacts.",
            LocalDateTime.now().plusDays(7),
            true,
            DeliverableStatus.PUBLISHED
        ));
        Deliverable otherDeliverable = deliverableRepository.save(new Deliverable(
            workspaceId,
            "Other Deliverable",
            "Other Deliverable",
            "other-deliverable-" + UUID.randomUUID(),
            "Other work.",
            LocalDateTime.now().plusDays(7),
            true,
            DeliverableStatus.PUBLISHED
        ));
        String frameworkFieldId = "framework-secure-" + UUID.randomUUID();
        String offFieldId = "off-secure-" + UUID.randomUUID();
        String otherFieldId = "other-secure-" + UUID.randomUUID();
        fieldRepository.saveAll(List.of(
            pdfField(frameworkFieldId, deliverable, "frameworkModel", "Framework / Model", 0),
            new DeliverableField(
                offFieldId, deliverable.getId(), "disabledPdf", "Disabled PDF", DeliverableFieldType.DRIVE_PDF,
                true, 1, DocumentCheckPolicy.OFF, false, true
            ),
            pdfField(otherFieldId, otherDeliverable, "otherPdf", "Other PDF", 0)
        ));

        UUID responseUuid = UUID.randomUUID();
        String submittedUrl = "https://drive.google.com/file/d/stored-framework-file/view";
        responseRepository.save(response(
            responseUuid,
            workspaceId,
            deliverable.getId(),
            "{\"frameworkModel\":\"" + submittedUrl + "\",\"disabledPdf\":\"https://drive.google.com/file/d/disabled/view\"}"
        ));
        UUID otherResponseUuid = UUID.randomUUID();
        String otherResponseUrl = "https://drive.google.com/file/d/other-response-framework/view";
        responseRepository.save(response(
            otherResponseUuid,
            workspaceId,
            deliverable.getId(),
            "{\"frameworkModel\":\"" + otherResponseUrl + "\"}"
        ));

        assertRejectedCheck(UUID.randomUUID().toString(), frameworkFieldId, "MVP Validation", submittedUrl,
            "Response was not found in this workspace.");
        assertRejectedCheck(responseUuid.toString(), frameworkFieldId, "MVP Validation", otherResponseUrl,
            "Document Check source does not match the submitted value for this field.");
        assertRejectedCheck(responseUuid.toString(), otherFieldId, "MVP Validation", submittedUrl,
            "Document Check field does not belong to this response deliverable.");
        assertRejectedCheck(responseUuid.toString(), frameworkFieldId, "Other Deliverable", submittedUrl,
            "Document Check deliverable does not match the response deliverable.");
        assertRejectedCheck(responseUuid.toString(), frameworkFieldId, "MVP Validation",
            "https://drive.google.com/file/d/forged-file/view",
            "Document Check source does not match the submitted value for this field.");
        assertRejectedCheck(responseUuid.toString(), offFieldId, "MVP Validation",
            "https://drive.google.com/file/d/disabled/view",
            "This response field is not enabled for Document Check.");

        mockMvc.perform(post("/api/file-checks").with(session())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "responseId": "%s",
                      "fieldId": "%s",
                      "deliverableKey": "MVP Validation",
                      "sourceUrl": "%s",
                      "sourceResponseUpdatedAt": "2026-09-11T05:00:00+08:00"
                    }
                    """.formatted(responseUuid, frameworkFieldId, submittedUrl)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("UNAVAILABLE"))
            .andExpect(jsonPath("$.fieldId").value(frameworkFieldId))
            .andExpect(jsonPath("$.sourceUrl").value(submittedUrl));
    }

    private void createUnavailableCheck(String responseId, String deliverableKey, String fieldId, String sourceUrl)
        throws Exception {
        mockMvc.perform(post("/api/file-checks").with(session())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "responseId": "%s",
                      "fieldId": "%s",
                      "deliverableKey": "%s",
                      "sourceUrl": "%s",
                      "sourceResponseUpdatedAt": "2026-09-11T05:00:00+08:00"
                    }
                    """.formatted(responseId, fieldId, deliverableKey, sourceUrl)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("UNAVAILABLE"))
            .andExpect(jsonPath("$.fieldId").value(fieldId))
            .andExpect(jsonPath("$.sourceUrl").value(sourceUrl));
    }

    private void assertRejectedCheck(
        String responseId,
        String fieldId,
        String deliverableKey,
        String sourceUrl,
        String expectedMessage
    ) throws Exception {
        mockMvc.perform(post("/api/file-checks").with(session())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "responseId": "%s",
                      "fieldId": "%s",
                      "deliverableKey": "%s",
                      "sourceUrl": "%s",
                      "sourceResponseUpdatedAt": "2026-09-11T05:00:00+08:00"
                    }
                    """.formatted(responseId, fieldId, deliverableKey, sourceUrl)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(expectedMessage));
    }

    private static FormResponse response(UUID responseId, UUID workspaceId, UUID deliverableId, String valuesJson) {
        Instant now = Instant.parse("2026-09-10T21:00:00Z");
        return new FormResponse(
            responseId,
            workspaceId,
            deliverableId,
            "subject-" + responseId,
            "student@example.com",
            UUID.randomUUID(),
            "20260001",
            "Student",
            "TEAM-1",
            valuesJson,
            now,
            now
        );
    }

    private static DeliverableField pdfField(
        String id,
        Deliverable deliverable,
        String fieldKey,
        String label,
        int displayOrder
    ) {
        return new DeliverableField(
            id,
            deliverable.getId(),
            fieldKey,
            label,
            DeliverableFieldType.DRIVE_PDF,
            true,
            displayOrder,
            DocumentCheckPolicy.MANUAL,
            true,
            true
        );
    }
}
