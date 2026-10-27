package com.capvault.backend.template;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.hasItems;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static com.capvault.backend.support.AuthenticatedRequest.adminSession;
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

    private static final String PDF_MIME = "application/pdf";
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
        String firstId = upload("SRS template", "Initial official SRS template instructions and required document sections").replaceAll(
            ".*\"id\":\"([^\"]+)\".*",
            "$1"
        );

        upload("Updated SRS template", "Updated official SRS template instructions and required sections");

        mockMvc.perform(get("/api/templates").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].displayName").value("Updated SRS template"))
            .andExpect(jsonPath("$[0].originalFilename").value("template.pdf"));

        mockMvc.perform(get("/api/templates/" + firstId + "/file").with(session()))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"template.pdf\""))
            .andExpect(content().contentType(PDF_MIME));

        mockMvc.perform(delete("/api/templates/" + firstId).with(adminSession()))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/templates").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    void previewsReadableTextAndBodyStructureWithoutAddingTextToListResponses() throws Exception {
        String text = "Table of Contents\n1. Introduction\t4\n2. Test Plan\t5\n3. Test Cases\t6\n"
            + "Introduction\nOverview instructions\nTest Plan\nPlan instructions\nTest Cases\nCase instructions\n";
        String id = responseId(upload("STD", null, "Official STD", text));

        mockMvc.perform(get("/api/templates/" + id + "/structure").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.templateId").value(id))
            .andExpect(jsonPath("$.displayName").value("Official STD"))
            .andExpect(jsonPath("$.originalFilename").value("template.pdf"))
            .andExpect(jsonPath("$.extractedText").value(org.hamcrest.Matchers.containsString("Overview instructions")))
            .andExpect(jsonPath("$.expectedHeadings", hasItems("Introduction", "Test Plan", "Test Cases")))
            .andExpect(jsonPath("$.detectedHeadings", hasItems("Introduction", "Test Plan", "Test Cases")));

        mockMvc.perform(get("/api/templates").with(session()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].extractedText").doesNotExist());
    }

    @Test
    void templateStructureRequiresAuthenticationAndTheMatchingWorkspace() throws Exception {
        String id = responseId(upload("Official SRS", "1. Introduction\nDescribe the project and its intended audience."));

        mockMvc.perform(get("/api/templates/" + id + "/structure"))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/templates/" + id + "/structure").with(session())
                .param("workspaceId", UUID.randomUUID().toString()))
            .andExpect(status().isBadRequest());
    }

    @Test
    void downloadsAndStoresDriveLinkedTemplate() throws Exception {
        byte[] bytes = pdf("Official Drive template instructions and expected SRS sections");
        DriveFileReference reference = new DriveFileReference("drive-template-id", null);
        when(driveGateway.isConfigured()).thenReturn(true);
        when(driveGateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
            "drive-template-id",
            "Official SRS Template.pdf",
            PDF_MIME,
            1024L,
            "https://drive.google.com/file/d/drive-template-id/view",
            java.time.OffsetDateTime.parse("2026-08-24T00:00:00Z"),
            true,
            "https://drive.google.com/uc?id=drive-template-id"
        ));
        when(driveGateway.download(reference)).thenReturn(bytes);
        String response = mockMvc.perform(post("/api/templates/from-drive").with(adminSession())
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
            .andExpect(jsonPath("$.originalFilename").value("Official SRS Template.pdf"))
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
        byte[] bytes = pdf("Project Proposal Official Capstone Template instructions and rubric details");
        DriveFileReference reference = new DriveFileReference("unicode-doc-id", null);
        when(driveGateway.isConfigured()).thenReturn(true);
        when(driveGateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
            "unicode-doc-id",
            "Project Proposal (Weeks 7–8).pdf",
            PDF_MIME,
            1024L,
            "https://drive.google.com/file/d/unicode-doc-id/view",
            java.time.OffsetDateTime.parse("2026-08-24T00:00:00Z"),
            true,
            "https://drive.google.com/uc?id=unicode-doc-id"
        ));
        when(driveGateway.download(reference)).thenReturn(bytes);
        mockMvc.perform(post("/api/templates/from-drive").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "deliverableKey": "Proposal",
                      "driveUrl": "https://drive.google.com/file/d/unicode-doc-id/view"
                    }
                    """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.originalFilename").value("Project Proposal (Weeks 7–8).pdf"));
    }

    @Test
    void rejectsDocxUploadWithoutReplacingTheCurrentPdf() throws Exception {
        String id = responseId(upload("Current PDF template", "Official PDF template instructions with sufficient readable content."));
        byte[] original = repository.findById(UUID.fromString(id)).orElseThrow().getContentBytes();
        MockMultipartFile file = new MockMultipartFile(
            "file", "template.docx", DOCX_MIME, docx("A Word template must be exported as a PDF before it can replace the current template."));

        mockMvc.perform(multipart("/api/templates").file(file).with(adminSession())
                .param("deliverableKey", "SRS").param("displayName", "Rejected DOCX"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Upload the official template as a PDF file."));

        assertEquals(1L, repository.count());
        mockMvc.perform(get("/api/templates/" + id + "/file").with(session()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(PDF_MIME))
            .andExpect(content().bytes(original));
    }

    @Test
    void rejectsNonPdfBytesEvenWithPdfFilenameAndContentType() throws Exception {
        byte[][] invalidFiles = {
            docx("Renaming a Word document does not make its bytes a PDF template."),
            "%PDF-1.7\nThis file has no valid PDF catalog or pages.".getBytes(StandardCharsets.UTF_8)
        };
        for (byte[] bytes : invalidFiles) {
            MockMultipartFile file = new MockMultipartFile("file", "template.pdf", PDF_MIME, bytes);
            mockMvc.perform(multipart("/api/templates").file(file).with(adminSession())
                    .param("deliverableKey", "SRS").param("displayName", "Invalid PDF"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("valid, unencrypted PDF")));
        }
        assertEquals(0L, repository.count());
    }

    @Test
    void rejectsDocxAndInvalidPdfDriveImportsWithoutReplacingTheCurrentPdf() throws Exception {
        String id = responseId(upload("Current PDF template", "Official PDF template instructions with sufficient readable content."));
        byte[] original = repository.findById(UUID.fromString(id)).orElseThrow().getContentBytes();
        DriveFileReference reference = configureDriveTemplate(
            "unsupported.docx", DOCX_MIME, docx("A Drive Word document must be exported as PDF before import."));
        String request = """
            {
              "deliverableKey": "SRS",
              "driveUrl": "https://drive.google.com/file/d/rejected-drive-template/view"
            }
            """;

        mockMvc.perform(post("/api/templates/from-drive").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Upload the official template as a PDF file."));
        verify(driveGateway, never()).download(reference);

        configureDriveTemplate("invalid.pdf", PDF_MIME, "Not a PDF document".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(post("/api/templates/from-drive").with(adminSession())
                .contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("valid, unencrypted PDF")));

        assertEquals(1L, repository.count());
        mockMvc.perform(get("/api/templates/" + id + "/file").with(session()))
            .andExpect(status().isOk())
            .andExpect(content().contentType(PDF_MIME))
            .andExpect(content().bytes(original));
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
            "file", "template.pdf", PDF_MIME, pdf("VALIDATION TEMPLATE CONTENT WITH ENOUGH READABLE TEXT"));

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
            "template.pdf",
            PDF_MIME,
            pdf(text)
        );
        var request = multipart("/api/templates")
            .file(file)
            .param("deliverableKey", deliverableKey)
            .param("displayName", displayName)
            .with(adminSession());
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

    private DriveFileReference configureDriveTemplate(String filename, String contentType, byte[] bytes) {
        DriveFileReference reference = new DriveFileReference("rejected-drive-template", null);
        when(driveGateway.isConfigured()).thenReturn(true);
        when(driveGateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
            "rejected-drive-template", filename, contentType, (long) bytes.length,
            "https://drive.google.com/file/d/rejected-drive-template/view",
            OffsetDateTime.parse("2026-08-24T00:00:00Z"), true,
            "https://drive.google.com/uc?id=rejected-drive-template"));
        when(driveGateway.download(reference)).thenReturn(bytes);
        return reference;
    }

    private static byte[] pdf(String text) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                stream.setLeading(14);
                stream.newLineAtOffset(30, 740);
                for (String line : text.split("\\R", -1)) {
                    stream.showText(line.replace("\t", "    "));
                    stream.newLine();
                }
                stream.endText();
            }
            document.save(output);
            return output.toByteArray();
        }
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
