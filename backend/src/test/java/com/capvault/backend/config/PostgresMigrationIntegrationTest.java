package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import javax.sql.DataSource;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.filemonitor.FileMonitorEventRecorder;

class PostgresMigrationIntegrationTest {

    @Test
    void flywayInitializesAndRevalidatesAnEmptyRealPostgresDatabase() throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load();

            MigrateResult firstMigration = flyway.migrate();

            assertThat(firstMigration.migrationsExecuted).isPositive();
            assertThat(flyway.info().pending()).isEmpty();
            assertThat(tableExists(dataSource, "archive_batches")).isTrue();
            assertThat(tableExists(dataSource, "sheet_import_previews")).isTrue();
            assertThat(tableExists(dataSource, "document_check_work")).isTrue();
            assertThat(columnExists(dataSource, "form_responses", "current_student_key")).isTrue();
            assertThat(tableExists(dataSource, "domain_audit_events")).isTrue();
            assertThat(tableExists(dataSource, "response_tracker_outbox")).isTrue();
            assertThat(tableExists(dataSource, "archive_records")).isTrue();
            assertThat(tableExists(dataSource, "academic_workspaces")).isTrue();
            assertThat(columnExists(dataSource, "academic_workspaces", "file_monitor_selection_configured")).isTrue();
            assertThat(tableExists(dataSource, "workspace_file_monitor_deliverables")).isTrue();
            assertThat(columnExists(dataSource, "academic_workspaces", "file_monitor_enabled")).isTrue();
            assertThat(tableExists(dataSource, "wildtrack_sessions")).isTrue();
            assertThat(tableExists(dataSource, "form_responses")).isTrue();
            assertThat(tableExists(dataSource, "response_feedback")).isTrue();
            assertThat(tableExists(dataSource, "drive_history_oauth_grants")).isTrue();
            assertThat(tableExists(dataSource, "drive_history_oauth_states")).isTrue();
            assertThat(tableExists(dataSource, "monitored_drive_files")).isTrue();
            assertThat(tableExists(dataSource, "monitored_drive_events")).isTrue();
            assertThat(tableExists(dataSource, "work_task_dismissals")).isTrue();
            assertThat(columnExists(dataSource, "drive_history_oauth_grants", "encrypted_refresh_token")).isTrue();
            assertThat(columnExists(dataSource, "drive_history_oauth_grants", "revoked_at")).isTrue();
            assertThat(columnExists(dataSource, "drive_history_oauth_states", "session_hash")).isTrue();
            assertThat(columnExists(dataSource, "drive_history_oauth_states", "nonce_hash")).isTrue();
            assertThat(columnExists(dataSource, "student_identity_conflicts", "decided_at")).isTrue();
            assertThat(columnExists(dataSource, "academic_student_records", "team_formation_code")).isTrue();
            assertThat(columnExists(dataSource, "academic_student_records", "software_title")).isTrue();
            assertThat(columnExists(dataSource, "academic_student_records", "current_active")).isTrue();
            assertThat(columnExists(dataSource, "academic_project_metadata", "current_group_code")).isTrue();
            assertThat(columnExists(dataSource, "academic_project_metadata", "current_software_name")).isTrue();
            assertThat(columnExists(dataSource, "academic_project_metadata", "current_adviser_name")).isTrue();
            assertThat(tableExists(dataSource, "academic_deliverable_fields")).isTrue();
            assertThat(tableExists(dataSource, "ai_review_field_links")).isTrue();
            assertThat(columnExists(dataSource, "academic_file_check_reports", "field_id")).isTrue();
            assertThat(columnExists(dataSource, "academic_file_check_reports", "source_value_sha256")).isTrue();
            assertThat(columnExists(dataSource, "academic_file_check_reports", "drive_last_modifying_user_email")).isTrue();
            assertThat(columnExists(dataSource, "academic_file_check_reports", "drive_last_modifying_user_display_name")).isTrue();
            assertThat(columnExists(dataSource, "academic_file_check_reports", "drive_created_time")).isTrue();
            assertThat(columnExists(dataSource, "academic_file_check_reports", "drive_owner_display")).isTrue();
            assertThat(columnExists(dataSource, "academic_file_check_reports", "drive_owner_email")).isTrue();
            assertThat(columnExists(dataSource, "academic_document_templates", "field_id")).isTrue();
            assertThat(columnExists(dataSource, "archive_records", "artifact_snapshot_json")).isTrue();
            assertThat(constraintExists(dataSource, "academic_document_templates", "uq_academic_document_template_field")).isTrue();
            assertThat(constraintExists(dataSource, "academic_document_templates", "fk_document_template_field")).isTrue();
            assertThat(constraintExists(dataSource, "academic_file_check_reports", "fk_file_check_field")).isTrue();
            assertThat(constraintExists(dataSource, "ai_review_field_links", "ai_review_field_links_pkey")).isTrue();
            assertThat(indexExists(dataSource, "academic_deliverable_fields", "idx_deliverable_fields_deliverable")).isTrue();
            assertThat(indexExists(dataSource, "academic_file_check_reports", "idx_file_check_response_field")).isTrue();
            assertThat(indexExists(dataSource, "ai_review_field_links", "idx_ai_review_field_links_cache")).isTrue();

            assertThat(tableExists(dataSource, "academic_document_template_versions")).isTrue();
            assertThat(columnExists(dataSource, "academic_document_templates", "row_version")).isTrue();
            assertThat(columnExists(dataSource, "academic_document_template_versions", "source_bytes")).isTrue();
            assertThat(columnExists(dataSource, "academic_document_template_versions", "pdf_bytes")).isTrue();
            assertThat(constraintExists(dataSource, "academic_document_template_versions", "ck_template_pdf_ready")).isTrue();
            assertThat(tableExists(dataSource, "template_instruction_sets")).isTrue();
            assertThat(columnExists(dataSource, "template_instruction_sets", "completed_page")).isTrue();
            assertThat(tableExists(dataSource, "template_provider_files")).isTrue();
            assertThat(columnExists(dataSource, "template_provider_files", "expires_at")).isTrue();
            assertThat(columnExists(dataSource, "ai_review_jobs", "heartbeat_at")).isTrue();
            assertThat(tableExists(dataSource, "ai_review_instruction_passes")).isTrue();
            assertThat(tableExists(dataSource, "template_checklists")).isTrue();
            assertThat(tableExists(dataSource, "template_checklist_approvals")).isTrue();
            assertThat(columnExists(dataSource, "template_checklist_approvals", "actor")).isTrue();
            assertThat(columnExists(dataSource, "ai_review_instruction_passes", "input_sha256")).isTrue();
            assertThat(columnExists(dataSource, "ai_review_instruction_passes", "report_json")).isTrue();

            MigrateResult secondMigration = flyway.migrate();
            assertThat(secondMigration.migrationsExecuted).isZero();
        }
    }

    @Test
    void olderObservationWithinTheSameMicrosecondCannotReplaceNewerInPostgres() throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().start()) {
            DataSource dataSource = postgres.getPostgresDatabase();
            Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
            JdbcTemplate db = new JdbcTemplate(dataSource);
            TransactionTemplate tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
            FileMonitorEventRecorder recorder = new FileMonitorEventRecorder(db);
            UUID workspace = UUID.randomUUID();
            String url = "https://drive.google.com/file/d/micro/view";
            var newer = new DriveFileMetadata("micro", "micro.pdf", "application/pdf", 100L, "new",
                OffsetDateTime.parse("2026-11-06T00:00:00Z"), null, null, true, url);
            var older = new DriveFileMetadata("micro", "micro.pdf", "application/pdf", 100L, "old",
                newer.modifiedTime(), null, null, true, url);
            tx.executeWithoutResult(s -> recorder.recordVerifiedContentChange(workspace, "micro", url, newer,
                Instant.parse("2026-11-06T00:00:00.123456400Z")));
            tx.executeWithoutResult(s -> recorder.recordVerifiedContentChange(workspace, "micro", url, older,
                Instant.parse("2026-11-06T00:00:00.123456100Z")));

            assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=?",
                String.class, workspace)).isEqualTo("new");
            assertThat(db.queryForObject("SELECT last_checked_at FROM monitored_drive_files WHERE workspace_id=?",
                java.sql.Timestamp.class, workspace).toInstant()).isEqualTo(Instant.parse("2026-11-06T00:00:00.123456Z"));
            assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=?",
                Integer.class, workspace)).isZero();

            tx.executeWithoutResult(s -> recorder.recordVerifiedContentChange(workspace, "micro", url, older,
                Instant.parse("2026-11-06T00:00:00.123457Z")));
            assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=?",
                String.class, workspace)).isEqualTo("old");
            assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=?",
                Integer.class, workspace)).isEqualTo(1);
        }
    }

    private boolean tableExists(DataSource dataSource, String tableName) throws Exception {
        try (
            Connection connection = dataSource.getConnection();
            ResultSet tables = connection.getMetaData().getTables(null, null, tableName, null)
        ) {
            return tables.next();
        }
    }

    private boolean columnExists(DataSource dataSource, String tableName, String columnName) throws Exception {
        try (
            Connection connection = dataSource.getConnection();
            ResultSet columns = connection.getMetaData().getColumns(null, null, tableName, columnName)
        ) {
            return columns.next();
        }
    }

    private boolean constraintExists(DataSource dataSource, String tableName, String constraintName) throws Exception {
        try (
            Connection connection = dataSource.getConnection();
            PreparedStatement statement = connection.prepareStatement("""
                SELECT 1
                FROM information_schema.table_constraints
                WHERE table_name = ? AND constraint_name = ?
                """)
        ) {
            statement.setString(1, tableName);
            statement.setString(2, constraintName);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }

    private boolean indexExists(DataSource dataSource, String tableName, String indexName) throws Exception {
        try (
            Connection connection = dataSource.getConnection();
            ResultSet indexes = connection.getMetaData().getIndexInfo(null, null, tableName, false, false)
        ) {
            while (indexes.next()) {
                if (indexName.equals(indexes.getString("INDEX_NAME"))) return true;
            }
            return false;
        }
    }
}
