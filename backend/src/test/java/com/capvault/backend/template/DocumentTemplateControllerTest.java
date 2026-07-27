package com.capvault.backend.template;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;

import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "capvault.templates.storage-path=target/test-templates")
class DocumentTemplateControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DocumentTemplateRepository repository;

    @BeforeEach
    void clearTemplates() {
        repository.deleteAll();
    }

    @Test
    void uploadsReplacesListsAndDeletesTemplate() throws Exception {
        String firstId = upload("SRS template", "Initial official SRS template instructions").replaceAll(
            ".*\\\"id\\\":\\\"([^\\\"]+)\\\".*",
            "$1"
        );

        upload("Updated SRS template", "Updated official SRS template instructions and required sections");

        mockMvc.perform(get("/api/templates"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].displayName").value("Updated SRS template"))
            .andExpect(jsonPath("$[0].originalFilename").value("template.docx"));

        mockMvc.perform(delete("/api/templates/" + firstId))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/templates"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(0)));
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
                .param("displayName", displayName))
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
