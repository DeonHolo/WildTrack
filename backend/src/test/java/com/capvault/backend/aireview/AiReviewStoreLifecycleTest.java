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
            new ClassPathResource("db/migration/V33__ai_review_attempt_history.sql"),
            new ClassPathResource("db/migration/V39__durable_ai_review_failure_diagnostics.sql")).execute(ds);
        jdbc.execute("ALTER TABLE ai_review_response_links ADD COLUMN source_verified_at TIMESTAMP WITH TIME ZONE");
        jdbc.execute("""
            CREATE TABLE ai_review_field_links(
                response_id UUID NOT NULL REFERENCES form_responses(id), field_id VARCHAR(80) NOT NULL,
                source_value_sha256 VARCHAR(64) NOT NULL, cache_key VARCHAR(64) NOT NULL REFERENCES ai_review_jobs(cache_key),
                source_verified_at TIMESTAMP WITH TIME ZONE, PRIMARY KEY(response_id, field_id))
            """);
        jdbc.update("INSERT INTO academic_workspaces VALUES (?)", workspace);
        jdbc.update("INSERT INTO academic_deliverables VALUES (?)", deliverable);
        store = new AiReviewStore(jdbc, new DataSourceTransactionManager(ds), Clock.systemUTC());
    }

    @Test void failureDiagnosticPersistsForUncertainAndClearsOnAcquiredRetryAndCompletion() {
        var failed = store.claim("diagnostic", workspace, deliverable, "team", "pdf", "ctx", null).job();
        store.uncertain(failed, "REQUEST_PARAMETER_REJECTED", "{\"reasonCode\":\"REQUEST_PARAMETER_REJECTED\"}");
        assertThat(store.find("diagnostic").orElseThrow().failureDiagnosticJson())
            .contains("REQUEST_PARAMETER_REJECTED");

        var retry = store.claim("diagnostic", workspace, deliverable, "team", "pdf", "ctx", failed.token()).job();
        assertThat(retry.failureDiagnosticJson()).isNull();
        store.complete(retry, "{\"summary\":\"completed\"}");
        var completed = store.find("diagnostic").orElseThrow();
        assertThat(completed.failureDiagnosticJson()).isNull();
        assertThat(completed.failureCode()).isNull();
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

    private AiReviewStore at(String time) {
        return new AiReviewStore(jdbc, new DataSourceTransactionManager(jdbc.getDataSource()),
            Clock.fixed(java.time.Instant.parse(time), java.time.ZoneOffset.UTC));
    }

    private UUID newResponse() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO form_responses VALUES (?)", id);
        return id;
    }

    private void linkBoth(AiReviewStore storage, UUID response, String key) {
        storage.link(response, 0, key);
        storage.linkField(response, "pdf-field", "source", key);
    }

    private void assertReceipt(AiReviewStore storage, UUID response, String key, String expected) {
        var receipt = expected == null ? null : java.time.Instant.parse(expected);
        assertThat(storage.sourceVerifiedAt(response, "legacy", key, true)).isEqualTo(receipt);
        assertThat(storage.sourceVerifiedAt(response, "pdf-field", key, false)).isEqualTo(receipt);
    }

    @Test void runningAndFailedRerunsPreserveTheOldReportVerificationReceipt() {
        UUID response = newResponse();
        var original = at("2026-10-13T14:55:20Z");
        var job = original.claim("failed", workspace, deliverable, "team", "pdf", "ctx", null).job();
        original.complete(job, "old report");
        linkBoth(original, response, "failed");
        var later = at("2026-10-13T20:44:13Z");
        var rerun = later.claim("failed", workspace, deliverable, "team", "pdf", "ctx", null, true).job();
        linkBoth(later, response, "failed");
        assertReceipt(later, response, "failed", "2026-10-13T14:55:20Z");
        later.uncertain(rerun, "REQUEST_REJECTED");
        assertReceipt(later, response, "failed", "2026-10-13T14:55:20Z");
        assertThat(later.find("failed").orElseThrow().reportJson()).isEqualTo("old report");
    }

    @Test void failureAfterSuccessfulReuseRetainsTheLegitimateReuseReceipt() {
        UUID response = newResponse();
        var original = at("2026-10-13T14:55:20Z");
        var job = original.claim("reused", workspace, deliverable, "team", "pdf", "ctx", null).job();
        original.complete(job, "old report");
        var reuse = at("2026-10-13T19:00:00Z");
        linkBoth(reuse, response, "reused");
        var later = at("2026-10-13T20:44:13Z");
        var rerun = later.claim("reused", workspace, deliverable, "team", "pdf", "ctx", null, true).job();
        linkBoth(later, response, "reused");
        later.uncertain(rerun, "QUEUE_FULL");
        assertReceipt(later, response, "reused", "2026-10-13T19:00:00Z");
    }

    @Test void completionUsesCapturedInputTimeAndAStaleCompletionCannotAdvanceIt() {
        UUID response = newResponse();
        var start = at("2026-10-13T20:00:00Z");
        var job = start.claim("completed", workspace, deliverable, "team", "pdf", "ctx", null).job();
        linkBoth(start, response, "completed");
        assertReceipt(start, response, "completed", null);
        var completed = at("2026-10-13T20:10:00Z");
        completed.complete(job, "saved report", true, java.time.Instant.parse("2026-10-13T19:59:59Z"));
        assertReceipt(completed, response, "completed", "2026-10-13T19:59:59Z");
        var rerun = completed.claim("completed", workspace, deliverable, "team", "pdf", "ctx", null, true).job();
        completed.complete(job, "stale worker", true, java.time.Instant.parse("2026-10-13T20:20:00Z"));
        assertReceipt(completed, response, "completed", "2026-10-13T19:59:59Z");
        assertThat(completed.find("completed").orElseThrow().token()).isEqualTo(rerun.token());
        assertThat(completed.find("completed").orElseThrow().state()).isEqualTo("RUNNING");
    }

    @Test void migrationRepairsAmbiguousFailedReceiptsWithoutErasingCompletedReceipts() {
        UUID failedResponse = newResponse(), completedResponse = newResponse();
        var original = at("2026-10-13T14:55:20Z");
        var failed = original.claim("broken-receipt", workspace, deliverable, "team", "pdf", "ctx", null).job();
        original.complete(failed, "saved report");
        linkBoth(original, failedResponse, "broken-receipt");
        var good = original.claim("good-receipt", workspace, deliverable, "team", "pdf", "ctx", null).job();
        original.complete(good, "saved report");
        linkBoth(original, completedResponse, "good-receipt");
        var rerun = original.claim("broken-receipt", workspace, deliverable, "team", "pdf", "ctx", null, true).job();
        original.uncertain(rerun, "REQUEST_REJECTED");
        jdbc.update("UPDATE ai_review_field_links SET source_verified_at = ? WHERE cache_key = ?",
            java.sql.Timestamp.from(java.time.Instant.parse("2026-10-13T20:44:13Z")), "broken-receipt");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V38__repair_failed_ai_review_verification.sql"))
            .execute(jdbc.getDataSource());
        assertReceipt(original, failedResponse, "broken-receipt", null);
        assertReceipt(original, completedResponse, "good-receipt", "2026-10-13T14:55:20Z");
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
