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

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import jakarta.servlet.http.Cookie;

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
import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.AdviserTeamAssignment;
import com.capvault.backend.staff.AdviserTeamAssignmentRepository;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;

@SpringBootTest(properties = {
    "capvault.google.drive.enabled=false",
    "capvault.google.drive.api-key="
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
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

    @Autowired
    private WildTrackSessionService sessionService;

    @Autowired
    private StaffRoleAssignmentRepository staffRoles;

    @Autowired
    private AdviserTeamAssignmentRepository adviserTeams;

    private Cookie adminCookie;

    @BeforeEach
    void clearReports() {
        repository.deleteAll();
        adminCookie = sessionCookie(StaffRole.ADMIN);
    }

    @Test
    void absentDocumentCheckReturnsNotFound() throws Exception {
        mockMvc.perform(get("/api/file-checks/not-checked-yet").cookie(adminCookie).with(csrf()))
            .andExpect(status().isNotFound());
    }

    @Test
    void reportsHonestUnconfiguredStateAndPersistsAttempt() throws Exception {
        mockMvc.perform(get("/api/file-checks/status").cookie(adminCookie).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.configured").value(false))
            .andExpect(jsonPath("$.message").value(
                "Google Drive API is not configured. Run setup-local.ps1 and restart the backend."
            ));

        mockMvc.perform(post("/api/file-checks").cookie(adminCookie).with(csrf())
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

        mockMvc.perform(get("/api/file-checks/response-001").cookie(adminCookie).with(csrf()))
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
                .cookie(adminCookie).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fieldId").value(frameworkFieldId))
            .andExpect(jsonPath("$.sourceUrl").value(frameworkUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId)
                .param("fieldId", highlightsFieldId)
                .cookie(adminCookie).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.fieldId").value(highlightsFieldId))
            .andExpect(jsonPath("$.sourceUrl").value(highlightsUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId + "/history")
                .param("fieldId", frameworkFieldId)
                .cookie(adminCookie).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].fieldId").value(frameworkFieldId))
            .andExpect(jsonPath("$[0].sourceUrl").value(frameworkUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId + "/history")
                .param("fieldId", highlightsFieldId)
                .cookie(adminCookie).with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].fieldId").value(highlightsFieldId))
            .andExpect(jsonPath("$[0].sourceUrl").value(highlightsUrl));

        mockMvc.perform(get("/api/file-checks/" + responseId).cookie(adminCookie).with(csrf()))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/file-checks/" + responseId + "/history").cookie(adminCookie).with(csrf()))
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

        mockMvc.perform(post("/api/file-checks").cookie(adminCookie).with(csrf())
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

    @Test
    void persistedAdviserCanCheckAssignedResponseButCannotAccessAnotherTeam() throws Exception {
        UUID workspaceId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        String deliverableKey = "Assigned review " + UUID.randomUUID();
        Deliverable deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, deliverableKey, "Assigned review", "assigned-review-" + UUID.randomUUID(),
            "Submit the PDF.", LocalDateTime.now().plusDays(7), true, DeliverableStatus.PUBLISHED));
        String fieldId = "assigned-pdf-" + UUID.randomUUID();
        String sourceUrl = "https://drive.google.com/file/d/assigned-file/view";
        fieldRepository.save(pdfField(fieldId, deliverable, "pdf", "PDF", 0));
        UUID assignedId = UUID.randomUUID();
        UUID unassignedId = UUID.randomUUID();
        responseRepository.save(response(assignedId, workspaceId, deliverable.getId(),
            "{\"pdf\":\"" + sourceUrl + "\"}", "MY-TEAM"));
        responseRepository.save(response(unassignedId, workspaceId, deliverable.getId(),
            "{\"pdf\":\"https://drive.google.com/file/d/other-file/view\"}", "OTHER-TEAM"));
        String subject = "assigned-adviser-" + UUID.randomUUID();
        Cookie adviser = sessionCookie(subject, StaffRole.ADVISER);
        adviserTeams.save(new AdviserTeamAssignment(
            UUID.randomUUID(), workspaceId, subject, "MY-TEAM", Instant.now()));

        createUnavailableCheck(adviser, assignedId.toString(), deliverableKey, fieldId, sourceUrl);
        mockMvc.perform(get("/api/file-checks/" + assignedId).param("fieldId", fieldId).cookie(adviser))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.responseId").value(assignedId.toString()));
        mockMvc.perform(get("/api/file-checks/" + assignedId + "/history")
                .param("fieldId", fieldId).cookie(adviser))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)));
        mockMvc.perform(get("/api/file-checks/" + unassignedId).param("fieldId", fieldId).cookie(adviser))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/file-checks/" + unassignedId + "/history").cookie(adviser))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/file-checks").cookie(adviser).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"responseId":"%s","fieldId":"%s","deliverableKey":"%s",
                     "sourceUrl":"https://drive.google.com/file/d/other-file/view",
                     "sourceResponseUpdatedAt":"2026-09-11T05:00:00+08:00"}
                    """.formatted(unassignedId, fieldId, deliverableKey)))
            .andExpect(status().isForbidden());
    }

    @Test
    void adviserCannotUseLegacyOrMissingResponseIdsAndStudentCannotReadChecks() throws Exception {
        Cookie adviser = sessionCookie(StaffRole.ADVISER);
        mockMvc.perform(get("/api/file-checks/response-001").cookie(adviser))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/file-checks/" + UUID.randomUUID()).cookie(adviser))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/file-checks/response-001").cookie(sessionCookie()))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/file-checks/response-001"))
            .andExpect(status().isUnauthorized());
    }

    private void createUnavailableCheck(String responseId, String deliverableKey, String fieldId, String sourceUrl)
        throws Exception {
        createUnavailableCheck(adminCookie, responseId, deliverableKey, fieldId, sourceUrl);
    }

    private void createUnavailableCheck(Cookie caller, String responseId, String deliverableKey,
                                        String fieldId, String sourceUrl) throws Exception {
        mockMvc.perform(post("/api/file-checks").cookie(caller).with(csrf())
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
        mockMvc.perform(post("/api/file-checks").cookie(adminCookie).with(csrf())
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
        return response(responseId, workspaceId, deliverableId, valuesJson, "TEAM-1");
    }

    private static FormResponse response(UUID responseId, UUID workspaceId, UUID deliverableId,
                                         String valuesJson, String teamCode) {
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
            teamCode,
            valuesJson,
            now,
            now
        );
    }

    private Cookie sessionCookie(StaffRole... roles) {
        return sessionCookie("filecheck-staff-" + UUID.randomUUID(), roles);
    }

    private Cookie sessionCookie(String subject, StaffRole... roles) {
        String email = subject + "@example.test";
        Instant now = Instant.now();
        for (StaffRole role : roles) {
            staffRoles.save(new StaffRoleAssignment(UUID.randomUUID(), subject, email, role, true, now, now));
        }
        String token = sessionService.create(new GoogleIdentity(subject, email, "File Check Tester", null)).rawToken();
        return new Cookie("WILDTRACK_SESSION", token);
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
