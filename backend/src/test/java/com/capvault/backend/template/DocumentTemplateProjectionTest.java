package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.filecheck.TemplateComparator;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest(showSql = false, properties = {
    "spring.flyway.enabled=false",
    "spring.jpa.hibernate.ddl-auto=create-drop"
})
@ActiveProfiles("test")
@Import(DocumentTemplateProjectionTest.SqlCaptureConfiguration.class)
class DocumentTemplateProjectionTest {
    @Autowired private DocumentTemplateRepository repository;
    @Autowired private TestEntityManager entities;
    @Autowired private TemplateQueries queries;
    private DocumentTemplateService service;
    private final UUID workspace = UUID.randomUUID();

    @BeforeEach
    void prepareService() {
        service = new DocumentTemplateService(repository, mock(DocumentTextExtractor.class),
            new TemplateStorageProperties("unused", 15_728_640), mock(GoogleDriveGateway.class),
            mock(DeliverableRepository.class), mock(DeliverableFieldRepository.class), mock(TemplateComparator.class));
        queries.clear();
    }

    @Test
    void summariesPreserveAllPublicValuesAndOrderWithoutLoadingFileOrExtractedText() {
        var std = template(workspace, "STD", "test-document", "STD template", "Complete STD authority text");
        var srs = template(workspace, "SRS", null, "Legacy SRS template", "Complete SRS authority text");
        template(UUID.randomUUID(), "SDD", null, "Other workspace template", "Other authority text");
        entities.getEntityManager().refresh(srs);
        entities.getEntityManager().refresh(std);
        var expected = List.of(DocumentTemplateResponse.from(srs), DocumentTemplateResponse.from(std));
        clearPersistenceContext();

        assertThat(service.list(workspace)).containsExactlyElementsOf(expected);
        assertThat(queries.selects()).hasSize(1).allSatisfy(sql ->
            assertThat(sql).doesNotContain("content_bytes", "extracted_text", "storage_path"));
    }

    @Test
    void authorityReadsKeepCompleteTextAndHashAndExactWorkspaceAndFieldSelection() {
        String text = "1. Introduction\nComplete authority — including spacing and Unicode.\n".repeat(4_000);
        var framework = template(workspace, "MVP Validation", "framework", "Framework template", text);
        var legacy = template(workspace, "MVP Validation", null, "Legacy template", "Legacy authority");
        template(workspace, "MVP Validation", "highlights", "Highlights template", "Different authority");
        template(UUID.randomUUID(), "MVP Validation", "framework", "Private template", "Other workspace authority");
        clearPersistenceContext();

        assertThat(service.findText(workspace, "mvp validation", " framework "))
            .isEqualTo(new DocumentTemplateText(text, framework.getSha256()));
        assertThat(service.findText(workspace, "MVP VALIDATION", null))
            .isEqualTo(new DocumentTemplateText(legacy.getExtractedText(), legacy.getSha256()));
        assertThat(service.findText(workspace, "MVP Validation", "   "))
            .isEqualTo(new DocumentTemplateText(legacy.getExtractedText(), legacy.getSha256()));
        assertThat(service.findText(workspace, "MVP Validation", "missing-field")).isNull();
        assertThat(service.findText(UUID.randomUUID(), "MVP Validation", "framework")).isNull();
        assertThat(queries.selects()).hasSize(5).allSatisfy(sql -> {
            assertThat(sql).contains("extracted_text", "sha256")
                .doesNotContain("content_bytes", "storage_path", "original_filename");
        });
    }

    @Test
    void fileReadStillLoadsOriginalBytesAndEnforcesWorkspaceScope() {
        var saved = template(workspace, "STD", "test-document", "STD template", "Authority text");
        byte[] expectedBytes = saved.getContentBytes().clone();
        clearPersistenceContext();

        var opened = service.readFile(workspace, saved.getId());
        assertThat(opened.bytes()).containsExactly(expectedBytes);
        assertThat(opened.filename()).isEqualTo(saved.getOriginalFilename());
        assertThat(opened.contentType()).isEqualTo(saved.getContentType());
        assertThat(queries.selects()).hasSize(1).allSatisfy(sql -> assertThat(sql).contains("content_bytes"));
        assertThatThrownBy(() -> service.readFile(UUID.randomUUID(), saved.getId()))
            .isInstanceOf(IllegalArgumentException.class).hasMessage("Template was not found.");
    }

    private DocumentTemplate template(UUID scope, String key, String field, String label, String text) {
        return entities.persistAndFlush(new DocumentTemplate(scope, key, field, label,
            key + ".pdf", "application/pdf", ("Original file for " + label).getBytes(StandardCharsets.UTF_8),
            null, "a".repeat(64), text));
    }

    private void clearPersistenceContext() {
        entities.clear();
        queries.clear();
    }

    static class TemplateQueries implements StatementInspector {
        private final List<String> selects = new CopyOnWriteArrayList<>();

        @Override
        public String inspect(String sql) {
            String normalized = sql.toLowerCase(Locale.ROOT);
            if (normalized.startsWith("select") && normalized.contains("academic_document_templates")) {
                selects.add(normalized);
            }
            return sql;
        }

        List<String> selects() { return List.copyOf(selects); }
        void clear() { selects.clear(); }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SqlCaptureConfiguration {
        @Bean TemplateQueries templateQueries() { return new TemplateQueries(); }

        @Bean HibernatePropertiesCustomizer captureTemplateQueries(TemplateQueries queries) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", queries);
        }
    }
}
