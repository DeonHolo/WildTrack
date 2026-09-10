package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
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
            assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("19");
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
}
