package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

class TemplateChecklistReadOnlyPostgresTest {
    @Test
    void savedReviewChecklistLookupsNeverWriteEvenWhenAWorkerLeaseExpired() throws Exception {
        try (var postgres = EmbeddedPostgres.builder().start()) {
            var source = postgres.getPostgresDatabase();
            Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
            var db = new JdbcTemplate(source);
            var store = new TemplateChecklistStore(db, new ObjectMapper());
            var pdfs = mock(TemplatePdfStore.class);
            var preparation = mock(TemplateInstructionStore.class);
            var service = new TemplateChecklistService(store, pdfs, preparation);
            var workspace = UUID.fromString("11111111-1111-1111-1111-111111111111");
            var template = UUID.randomUUID();
            var version = UUID.randomUUID();
            db.update("""
                INSERT INTO academic_document_templates
                    (id,workspace_id,deliverable_key,display_name,original_filename,content_type,
                     storage_path,sha256,extracted_text,extracted_character_count,created_at,updated_at)
                VALUES (?,?,'BATCH_READ_ONLY','Test','Test.pdf','application/pdf','test','source','Test',4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
                """, template, workspace);
            db.update("""
                INSERT INTO academic_document_template_versions
                    (id,template_id,workspace_id,deliverable_key,display_name,original_filename,
                     source_content_type,source_sha256,pdf_state,pdf_bytes,pdf_sha256,pdf_pages)
                VALUES (?,?,?,'TEST','Test','Test.pdf','application/pdf','source','READY',?,'pdf',1)
                """, version, template, workspace, new byte[]{1});
            when(pdfs.current(workspace, template)).thenReturn(new TemplatePdfStore.Status(
                version, template, "source", "Test.pdf", "READY", 1, null, true));
            var readOnly = new TransactionTemplate(new DataSourceTransactionManager(source));
            readOnly.setReadOnly(true);

            readOnly.executeWithoutResult(transaction -> {
                assertThat(db.queryForObject("SHOW transaction_read_only", String.class)).isEqualTo("on");
                assertThat(service.get(workspace, template).state()).isEqualTo("UNPREPARED");
                assertThat(service.batch(workspace).stream().filter(item -> item.templateId().equals(template)).findFirst().orElseThrow().state()).isEqualTo("UNPREPARED");
                assertThat(service.fingerprint(workspace, template)).hasSize(64);
            });
            String previous = service.fingerprint(workspace, template);
            for (String state : List.of("QUEUED", "PREPARING", "DRAFT", "APPROVED", "FAILED")) {
                db.update("""
                    INSERT INTO template_checklists
                        (version_id,revision,state,items_json,approved_at,approval_hash,lease_until)
                    VALUES (?,1,?,'[]',CURRENT_TIMESTAMP,'approved',CURRENT_TIMESTAMP - INTERVAL '1' MINUTE)
                    ON CONFLICT (version_id) DO UPDATE SET state=EXCLUDED.state
                    """, version, state);
                String current = readOnly.execute(transaction -> {
                    assertThat(service.get(workspace, template).state()).isEqualTo(state);
                    assertThat(service.batch(workspace).stream().filter(item -> item.templateId().equals(template)).findFirst().orElseThrow().state()).isEqualTo(state);
                    return service.fingerprint(workspace, template);
                });
                assertThat(current).isNotEqualTo(previous);
                previous = current;
                assertThat(db.queryForObject("SELECT state FROM template_checklists WHERE version_id=?",
                    String.class, version)).isEqualTo(state);
            }

            // The background worker, not page reads, expires an uncertain provider attempt.
            db.update("UPDATE template_checklists SET state='PREPARING' WHERE version_id=?", version);
            assertThat(store.claim()).isEmpty();
            var expired = readOnly.execute(transaction -> store.find(version).orElseThrow());
            assertThat(expired.state()).isEqualTo("FAILED");
            assertThat(expired.error()).isEqualTo("OUTCOME_UNKNOWN");
            assertThat(store.claim()).isEmpty();
            verify(pdfs, never()).readPdf(any(), any(), any());
            verifyNoInteractions(preparation);
        }
    }
}
