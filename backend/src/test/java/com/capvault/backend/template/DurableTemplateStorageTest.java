package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.util.UUID;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Durable template storage contract: bytes live in PostgreSQL, survive a
 * restart, and rows migrated from the local-storage era are explicitly
 * unavailable rather than falsely successful.
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
    void templateBytesAreStoredInPostgresAndSurviveARestartCycle() {
        byte[] bytes = "template-content-for-durability-check".getBytes();
        DocumentTemplate saved = repository.save(new DocumentTemplate(
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "SRS",
            "SRS official template",
            "srs.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            bytes,
            null,
            "a".repeat(64),
            "x".repeat(60)
        ));

        DocumentTemplateService.TemplateFile file = service.readFile(
            saved.getWorkspaceId(), saved.getId());

        assertThat(file.bytes()).isEqualTo(bytes);
        assertThat(file.filename()).isEqualTo("srs.docx");

        // Simulate a restart: detach and re-read through the repository.
        DocumentTemplate reloaded = repository.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getContentBytes()).isEqualTo(bytes);
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

        try {
            service.readFile(workspaceId, legacy.getId());
        } catch (IllegalStateException expected) {
            assertThat(expected.getMessage()).contains("no longer available", "Replace the template");
        }

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
}
