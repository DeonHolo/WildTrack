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
        jdbc.execute("ALTER TABLE ai_review_response_links ADD COLUMN source_verified_at TIMESTAMP WITH TIME ZONE");
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

    @Test void verifyingARestoredDocumentKeepsTheGenerationDateAndPersistsANewVerificationTime() {
        UUID response = UUID.randomUUID();
        jdbc.update("INSERT INTO form_responses VALUES (?)", response);
        var originalTime = java.time.Instant.parse("2026-10-13T14:55:20Z");
        var verifiedTime = java.time.Instant.parse("2026-10-13T16:30:00Z");
        var manager = new DataSourceTransactionManager(jdbc.getDataSource());
        var original = new AiReviewStore(jdbc, manager, Clock.fixed(originalTime, java.time.ZoneOffset.UTC));
        var job = original.claim("restored", workspace, deliverable, "team", "pdf", "ctx", null).job();
        original.complete(job, "saved review");
        original.link(response, 0, "restored");
        var later = new AiReviewStore(jdbc, manager, Clock.fixed(verifiedTime, java.time.ZoneOffset.UTC));
        later.link(response, 0, "restored");
        var saved = later.linkedFor(java.util.List.of(response)).get(response);
        assertThat(saved.job().completedAt()).isEqualTo(originalTime);
        assertThat(saved.sourceVerifiedAt()).isEqualTo(verifiedTime);
        assertThat(later.sourceVerifiedAt(response, "legacy", "restored", true)).isEqualTo(verifiedTime);
    }

    @Test void aPreparedRerunCannotReplaceANewerCompletedAttempt() {
        var first = store.claim("k", workspace, deliverable, "team", "pdf", "ctx", null).job();
        store.complete(first, "first");
        var newer = store.claim("k", workspace, deliverable, "team", "pdf", "ctx", null, true).job();
        store.complete(newer, "newer");
        var stalePlan = store.claim("k", workspace, deliverable, "team", "pdf", "ctx", null, true, first.token());
        assertThat(stalePlan.acquired()).isFalse();
        assertThat(stalePlan.job().latestAttemptReportJson()).isEqualTo("newer");
    }
}
