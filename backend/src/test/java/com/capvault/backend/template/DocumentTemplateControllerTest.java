package com.capvault.backend.template;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.hasItems;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static com.capvault.backend.support.AuthenticatedRequest.session;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "capvault.templates.storage-path=target/test-templates")
class DocumentTemplateControllerTest {

    private static final String DOCX_MIME =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DocumentTemplateRepository repository;

    @Autowired
    private DocumentTemplateService service;

    @Autowired
    private DeliverableRepository deliverableRepository;

    @Autowired
    private DeliverableFieldRepository fieldRepository;

    @MockBean
    private GoogleDriveGateway driveGateway;

    @BeforeEach
    void clearTemplates() {
        repository.deleteAll();
    }

    @Test
    void uploadsReplacesListsOpensAndDeletesTemplate() throws Exception {
        String firstId = upload("SRS template", "Initial official SRS template instructions").replaceAll(
            ".*\"id\":\"([^\"]+)\".*",
            "$1"
        );

        upload("Updated SRS template", "Updated official SRS template instructions and required sections");

        mockMvc.perform(get("/api/templates").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].displayName").value("Updated SRS template"))
            .andExpect(jsonPath("$[0].originalFilename").value("template.docx"));

        mockMvc.perform(get("/api/templates/" + firstId + "/file").with(session()))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"template.docx\""))
            .andExpect(content().contentType(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ));

        mockMvc.perform(delete("/api/templates/" + firstId).with(session()))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/templates").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void downloadsAndStoresDriveLinkedTemplate() throws Exception {
        byte[] bytes = docx("Official Drive template instructions and expected SRS sections");
        DriveFileReference reference = new DriveFileReference("drive-template-id", null);
        when(driveGateway.isConfigured()).thenReturn(true);
        when(driveGateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
            "drive-template-id",
            "Official SRS Template.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            1024L,
            "https://drive.google.com/file/d/drive-template-id/view",
            java.time.OffsetDateTime.parse("2026-08-24T00:00:00Z"),
            true,
            "https://drive.google.com/uc?id=drive-template-id"
        ));
        when(driveGateway.download(reference)).thenReturn(bytes);
        String response = mockMvc.perform(post("/api/templates/from-drive").with(session())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "deliverableKey": "SRS",
                      "driveUrl": "https://drive.google.com/file/d/drive-template-id/view"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.deliverableKey").value("SRS"))
            .andExpect(jsonPath("$.displayName").value("Official SRS Template"))
            .andExpect(jsonPath("$.originalFilename").value("Official SRS Template.docx"))
            .andReturn()
            .getResponse()
            .getContentAsString();

        String templateId = response.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
        mockMvc.perform(get("/api/templates/" + templateId + "/file").with(session()))
            .andExpect(status().isOk())
            .andExpect(content().bytes(bytes));
    }

    @Test
    void supportsUnicodeCharactersInFilename() throws Exception {
        byte[] bytes = docx("Project Proposal Official Capstone Template instructions and rubric details");
        DriveFileReference reference = new DriveFileReference("unicode-doc-id", null);
        when(driveGateway.isConfigured()).thenReturn(true);
        when(driveGateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
            "unicode-doc-id",
            "Project Proposal (Weeks 7–8).docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            1024L,
            "https://drive.google.com/file/d/unicode-doc-id/view",
            java.time.OffsetDateTime.parse("2026-08-24T00:00:00Z"),
            true,
            "https://drive.google.com/uc?id=unicode-doc-id"
        ));
        when(driveGateway.download(reference)).thenReturn(bytes);
        mockMvc.perform(post("/api/templates/from-drive").with(session())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "deliverableKey": "Proposal",
                      "driveUrl": "https://drive.google.com/file/d/unicode-doc-id/view"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.originalFilename").value("Project Proposal (Weeks 7–8).docx"));
    }

    @Test
    void keepsTemplatesIndependentPerArtifactFieldAndNeverFallsBackToAnotherTemplate() throws Exception {
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
        String unmatchedFieldId = "unmatched-" + UUID.randomUUID();
        fieldRepository.saveAll(List.of(
            pdfField(frameworkFieldId, deliverable, "frameworkModel", "Framework / Model", 0),
            pdfField(highlightsFieldId, deliverable, "validationHighlights", "MVP Validation Highlights", 1),
            pdfField(unmatchedFieldId, deliverable, "otherPdf", "Other PDF", 2)
        ));

        String legacyId = responseId(upload(
            deliverableKey,
            null,
            "Legacy MVP template",
            "LEGACY REQUIREMENTS\nLegacy instructions for the old one-link workflow"
        ));
        String frameworkId = responseId(upload(
            deliverableKey,
            frameworkFieldId,
            "Framework template",
            "FRAMEWORK REQUIREMENTS\nFramework-specific instructions and required model sections"
        ));
        String highlightsId = responseId(upload(
            deliverableKey,
            highlightsFieldId,
            "Highlights template",
            "HIGHLIGHTS REQUIREMENTS\nHighlights-specific instructions and evidence summary sections"
        ));

        assertNotEquals(frameworkId, highlightsId);
        assertNotEquals(legacyId, frameworkId);
        assertEquals("Framework template", service.find(workspaceId, deliverableKey, frameworkFieldId).getDisplayName());
        assertEquals("Highlights template", service.find(workspaceId, deliverableKey, highlightsFieldId).getDisplayName());
        assertEquals("Legacy MVP template", service.find(workspaceId, deliverableKey).getDisplayName());
        assertNull(service.find(workspaceId, deliverableKey, unmatchedFieldId));

        String replacedFrameworkId = responseId(upload(
            deliverableKey,
            frameworkFieldId,
            "Updated framework template",
            "UPDATED FRAMEWORK REQUIREMENTS\nOnly the Framework / Model artifact should be replaced"
        ));
        assertEquals(frameworkId, replacedFrameworkId);
        assertEquals("Updated framework template", service.find(workspaceId, deliverableKey, frameworkFieldId).getDisplayName());
        assertEquals("Highlights template", service.find(workspaceId, deliverableKey, highlightsFieldId).getDisplayName());

        mockMvc.perform(get("/api/templates").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(3)))
            .andExpect(jsonPath("$[*].fieldId", hasItems(frameworkFieldId, highlightsFieldId)));
    }

    @Test
    void rejectsTemplateFieldIdsFromAnotherDeliverableOrNonCheckableFields() throws Exception {
        UUID workspaceId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        String mvpKey = "MVP Validation " + UUID.randomUUID();
        Deliverable mvp = deliverableRepository.save(new Deliverable(
            workspaceId, mvpKey, "MVP Validation", "mvp-template-association-" + UUID.randomUUID(),
            "Submit validation artifacts.", LocalDateTime.now().plusDays(7), true, DeliverableStatus.PUBLISHED));
        Deliverable other = deliverableRepository.save(new Deliverable(
            workspaceId, "Other PDF", "Other PDF", "other-template-association-" + UUID.randomUUID(),
            "Other document.", LocalDateTime.now().plusDays(7), true, DeliverableStatus.PUBLISHED));
        String validId = "template-valid-" + UUID.randomUUID();
        String offId = "template-off-" + UUID.randomUUID();
        String otherId = "template-other-" + UUID.randomUUID();
        fieldRepository.saveAll(List.of(
            pdfField(validId, mvp, "frameworkModel", "Framework / Model", 0),
            new DeliverableField(offId, mvp.getId(), "disabledPdf", "Disabled PDF", DeliverableFieldType.DRIVE_PDF,
                true, 1, DocumentCheckPolicy.OFF, false, true),
            pdfField(otherId, other, "otherPdf", "Other PDF", 0)
        ));
        MockMultipartFile file = new MockMultipartFile(
            "file", "template.docx", DOCX_MIME, docx("VALIDATION TEMPLATE CONTENT WITH ENOUGH READABLE TEXT"));

        var crossDeliverable = assertThrows(IllegalArgumentException.class,
            () -> service.save(workspaceId, mvpKey, otherId, "Wrong field", file));
        assertEquals("Template field does not belong to this deliverable.", crossDeliverable.getMessage());

        var disabled = assertThrows(IllegalArgumentException.class,
            () -> service.save(workspaceId, mvpKey, offId, "Disabled field", file));
        assertEquals("Templates are only available for active PDF fields with Document Check enabled.", disabled.getMessage());

        var valid = service.save(workspaceId, mvpKey, validId, "Framework template", file);
        assertEquals(validId, valid.fieldId());
    }

    private String upload(String displayName, String text) throws Exception {
        return upload("SRS", null, displayName, text);
    }

    private String upload(String deliverableKey, String fieldId, String displayName, String text) throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "template.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            docx(text)
        );
        var request = multipart("/api/templates")
            .file(file)
            .param("deliverableKey", deliverableKey)
            .param("displayName", displayName)
            .with(session());
        if (fieldId != null) {
            request.param("fieldId", fieldId);
        }
        return mockMvc.perform(request)
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.deliverableKey").value(deliverableKey))
            .andReturn()
            .getResponse()
            .getContentAsString();
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

    private static String responseId(String response) {
        return response.replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");
    }

    private static byte[] docx(String text) throws Exception {
        try (XWPFDocument document = new XWPFDocument();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.createParagraph().createRun().setText(text.repeat(4));
            document.write(output);
            return output.toByteArray();
        }
    }
}
