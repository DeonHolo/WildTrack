package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import javax.sql.DataSource;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;

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
            assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("20");
            assertThat(tableExists(dataSource, "domain_audit_events")).isTrue();
            assertThat(tableExists(dataSource, "response_tracker_outbox")).isTrue();
            assertThat(tableExists(dataSource, "archive_records")).isTrue();
            assertThat(tableExists(dataSource, "academic_workspaces")).isTrue();
            assertThat(tableExists(dataSource, "wildtrack_sessions")).isTrue();
            assertThat(tableExists(dataSource, "form_responses")).isTrue();
            assertThat(tableExists(dataSource, "response_feedback")).isTrue();
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
            assertThat(columnExists(dataSource, "academic_document_templates", "field_id")).isTrue();
            assertThat(columnExists(dataSource, "archive_records", "artifact_snapshot_json")).isTrue();
            assertThat(constraintExists(dataSource, "academic_document_templates", "uq_academic_document_template_field")).isTrue();
            assertThat(constraintExists(dataSource, "academic_document_templates", "fk_document_template_field")).isTrue();
            assertThat(constraintExists(dataSource, "academic_file_check_reports", "fk_file_check_field")).isTrue();
            assertThat(constraintExists(dataSource, "ai_review_field_links", "ai_review_field_links_pkey")).isTrue();
            assertThat(indexExists(dataSource, "academic_deliverable_fields", "idx_deliverable_fields_deliverable")).isTrue();
            assertThat(indexExists(dataSource, "academic_file_check_reports", "idx_file_check_response_field")).isTrue();
            assertThat(indexExists(dataSource, "ai_review_field_links", "idx_ai_review_field_links_cache")).isTrue();

            MigrateResult secondMigration = flyway.migrate();
            assertThat(secondMigration.migrationsExecuted).isZero();
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
