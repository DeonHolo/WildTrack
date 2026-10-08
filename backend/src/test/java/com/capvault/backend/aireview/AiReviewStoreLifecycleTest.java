package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

class AiReviewStoreLifecycleTest {
    private JdbcTemplate jdbc;
    private AiReviewStore store;
    private UUID workspace = UUID.randomUUID(), deliverable = UUID.randomUUID();

    @BeforeEach void setup() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:lifecycle_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE TABLE academic_workspaces(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE academic_deliverables(id UUID PRIMARY KEY)");
        jdbc.execute("CREATE TABLE form_responses(id UUID PRIMARY KEY)");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V18__deduplicated_ai_reviews.sql"),
            new ClassPathResource("db/migration/V33__ai_review_attempt_history.sql")).execute(ds);
        jdbc.update("INSERT INTO academic_workspaces VALUES (?)", workspace);
        jdbc.update("INSERT INTO academic_deliverables VALUES (?)", deliverable);
        store = new AiReviewStore(jdbc, new DataSourceTransactionManager(ds), Clock.systemUTC());
    }

    @Test void inconclusiveAttemptIsLatestWithoutReplacingLastSubstantiveReport() {
        var first = store.claim("a", workspace, deliverable, "team", "pdf", "ctx", null).job();
        store.complete(first, "{\"summary\":\"substantive\"}", true);
        var second = store.claim("a", workspace, deliverable, "team", "pdf", "ctx", null, true).job();
        store.complete(second, "{\"summary\":\"inconclusive\"}", false);
        var saved = store.find("a").orElseThrow();
        assertThat(saved.state()).isEqualTo("COMPLETED");
        assertThat(saved.reportJson()).contains("substantive");
        assertThat(saved.latestAttemptReportJson()).contains("inconclusive");
        assertThat(saved.completedAt()).isNotNull();
        assertThat(saved.latestAttemptCompletedAt()).isNotNull();
    }
}
