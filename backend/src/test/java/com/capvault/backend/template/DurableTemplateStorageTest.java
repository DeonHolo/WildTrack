package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.sql.Connection;
import java.util.UUID;

import javax.sql.DataSource;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;

/**
 * Durable template storage contract: bytes live in PostgreSQL, can be reloaded,
 * and rows migrated from the local-storage era are explicitly unavailable
 * rather than falsely successful.
 */
@SpringBootTest
@ActiveProfiles("test")
class DurableTemplateStorageTest {

    @Autowired
    private DocumentTemplateRepository repository;

    @Autowired
    private DocumentTemplateService service;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private Flyway flyway;

    @Test
    void pdfTemplateBytesAreStoredDurablyAndCanBeReloaded() throws Exception {
        UUID workspaceId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        byte[] bytes = pdf("Official SRS template instructions remain available after the durable record is reloaded.");
        DocumentTemplateResponse saved = service.save(workspaceId, "SRS", "SRS official template",
            new MockMultipartFile("file", "srs.pdf", "application/pdf", bytes));

        DocumentTemplateService.TemplateFile file = service.readFile(workspaceId, saved.id());
        assertThat(file.bytes()).isEqualTo(bytes);
        assertThat(file.filename()).isEqualTo("srs.pdf");
        assertThat(file.contentType()).isEqualTo("application/pdf");

        DocumentTemplate reloaded = repository.findById(saved.id()).orElseThrow();
        assertThat(reloaded.getContentBytes()).isEqualTo(bytes);
        assertThat(reloaded.isBytesAvailable()).isTrue();

        repository.delete(reloaded);
    }

    @Test
    void legacyDocxOriginalBytesRemainAvailableWithoutReuploadOrConversion() throws Exception {
        String text = "Legacy official SRS instructions remain readable in their retained original Word file.";
        byte[] bytes;
        try (XWPFDocument document = new XWPFDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.createParagraph().createRun().setText(text);
            document.write(output);
            bytes = output.toByteArray();
        }
        DocumentTemplate saved = repository.save(new DocumentTemplate(
            UUID.fromString("11111111-1111-1111-1111-111111111111"), "LEGACY-DURABLE-SRS",
            "Legacy SRS official template", "legacy-srs.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bytes, null, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)), text));

        DocumentTemplate reloaded = repository.findById(saved.getId()).orElseThrow();
        DocumentTemplateService.TemplateFile file = service.readFile(reloaded.getWorkspaceId(), reloaded.getId());
        assertThat(file.bytes()).isEqualTo(bytes);
        assertThat(file.filename()).isEqualTo("legacy-srs.docx");
        assertThat(file.contentType()).isEqualTo("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        assertThat(reloaded.isBytesAvailable()).isTrue();

        repository.delete(reloaded);
    }


    @Test
    void migratedLocalEraRowsAreExplicitlyUnavailableInsteadOfFalseSuccess() {
        UUID workspaceId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        jdbcTemplate.update(
            "INSERT INTO academic_document_templates (id, workspace_id, deliverable_key, display_name, original_filename, content_type, storage_path, bytes_available, sha256, extracted_text, extracted_character_count, created_at, updated_at) "
                + "VALUES (?, ?, 'SDD', 'Legacy SDD template', 'legacy.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', './storage/templates/legacy.docx', FALSE, ?, ?, ?, NOW(), NOW())",
            UUID.randomUUID(), workspaceId, "b".repeat(64), "legacy readable text ".repeat(4), 80
        );

        var legacy = repository.findByWorkspaceIdAndDeliverableKeyIgnoreCase(workspaceId, "SDD").orElseThrow();

        assertThatThrownBy(() -> service.readFile(workspaceId, legacy.getId()))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("no longer available")
            .hasMessageContaining("Replace the template");

        assertThat(legacy.isBytesAvailable()).isFalse();
        jdbcTemplate.update("DELETE FROM academic_document_templates WHERE id = ?", legacy.getId());
    }

    @Test
    void durableStorageColumnsExistAfterMigrations() throws Exception {
        DataSource dataSource = jdbcTemplate.getDataSource();
        try (Connection connection = dataSource.getConnection()) {
            var columns = connection.getMetaData().getColumns(null, null, "academic_document_templates", null);
            boolean hasBytes = false;
            boolean hasFlag = false;
            while (columns.next()) {
                String name = columns.getString("COLUMN_NAME");
                hasBytes |= "content_bytes".equals(name);
                hasFlag |= "bytes_available".equals(name);
            }
            assertThat(hasBytes).isTrue();
            assertThat(hasFlag).isTrue();
        }
    }
    private static byte[] pdf(String text) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                stream.newLineAtOffset(30, 700);
                stream.showText(text);
                stream.endText();
            }
            document.save(output);
            return output.toByteArray();
        }
    }


}
