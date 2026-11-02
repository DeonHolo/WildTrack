package com.capvault.backend.response;

import static org.assertj.core.api.Assertions.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

class CurrentStudentResponseMigrationTest {
    @Test void existingDuplicatesKeepLatestCurrentAndPreserveEarlierAnswersAndStoredCopies() {
        var source = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE form_responses(id UUID PRIMARY KEY, workspace_id UUID, deliverable_id UUID, student_number VARCHAR(80), submitted_at TIMESTAMP, updated_at TIMESTAMP, values_json TEXT)");
        jdbc.execute("CREATE TABLE archive_records(id UUID PRIMARY KEY, response_id UUID, active BOOLEAN, state_version BIGINT, storage_key VARCHAR(240))");
        UUID workspace = UUID.randomUUID(), deliverable = UUID.randomUUID(), old = UUID.randomUUID(), latest = UUID.randomUUID(), otherForm = UUID.randomUUID();
        var september = Timestamp.from(Instant.parse("2026-09-19T00:16:00Z"));
        var october = Timestamp.from(Instant.parse("2026-10-14T13:07:00Z"));
        jdbc.update("INSERT INTO form_responses VALUES(?,?,?,?,?,?,?)", old, workspace, deliverable, "20-0649-750", september, september, "old answers");
        jdbc.update("INSERT INTO form_responses VALUES(?,?,?,?,?,?,?)", latest, workspace, deliverable, " 20-0649-750 ", october, october, "latest answers");
        jdbc.update("INSERT INTO form_responses VALUES(?,?,?,?,?,?,?)", otherForm, workspace, UUID.randomUUID(), "20-0649-750", september, september, "another deliverable");
        jdbc.update("INSERT INTO archive_records VALUES(?,?,?,?,?)", UUID.randomUUID(), old, true, 3, "preserved-old-copy.pdf");
        jdbc.update("INSERT INTO archive_records VALUES(?,?,?,?,?)", UUID.randomUUID(), latest, true, 1, "preserved-latest-copy.pdf");

        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V49__one_current_student_response.sql")).execute(source);

        assertThat(jdbc.queryForList("SELECT id FROM form_responses WHERE current_student_key IS NOT NULL", UUID.class))
            .containsExactlyInAnyOrder(latest, otherForm);
        assertThat(jdbc.queryForObject("SELECT values_json FROM form_responses WHERE id=?", String.class, old)).isEqualTo("old answers");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM form_responses", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT active FROM archive_records WHERE response_id=?", Boolean.class, old)).isFalse();
        assertThat(jdbc.queryForObject("SELECT state_version FROM archive_records WHERE response_id=?", Long.class, old)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT storage_key FROM archive_records WHERE response_id=?", String.class, old)).isEqualTo("preserved-old-copy.pdf");
        assertThat(jdbc.queryForObject("SELECT active FROM archive_records WHERE response_id=?", Boolean.class, latest)).isTrue();
        assertThatThrownBy(() -> jdbc.update("UPDATE form_responses SET current_student_key='20-0649-750' WHERE id=?", old))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}
