package com.capvault.backend.template;

import static org.hamcrest.Matchers.hasSize;
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
import java.time.OffsetDateTime;

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

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "capvault.templates.storage-path=target/test-templates")
class DocumentTemplateControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DocumentTemplateRepository repository;

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

    private String upload(String displayName, String text) throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file",
            "template.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            docx(text)
        );
        return mockMvc.perform(multipart("/api/templates")
                .file(file)
                .param("deliverableKey", "SRS")
                .param("displayName", displayName).with(session()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.deliverableKey").value("SRS"))
            .andReturn()
            .getResponse()
            .getContentAsString();
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


