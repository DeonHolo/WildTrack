package com.capvault.backend.aireview;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Short committed transactions; no database transaction is held across a provider request. */
@Repository
public class AiReviewStore {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Clock clock;
    private static final Duration ABANDONED_AFTER = Duration.ofMinutes(10);

    public AiReviewStore(JdbcTemplate jdbc, PlatformTransactionManager manager, Clock clock) {
        this.jdbc = jdbc; this.clock = clock;
        this.tx = new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public record Job(String key, String contextHash, String state, UUID token, Instant startedAt,
                      Instant completedAt, String reportJson, String failureCode,
                      String latestAttemptReportJson, Instant latestAttemptCompletedAt, String failureDiagnosticJson,
                      UUID workspaceId, UUID deliverableId, String teamCode) {
        public Job(String key, String contextHash, String state, UUID token, Instant startedAt,
                Instant completedAt, String reportJson, String failureCode) {
            this(key, contextHash, state, token, startedAt, completedAt, reportJson, failureCode,
                null, null, null, null, null, null);
        }
        public Job(String key, String contextHash, String state, UUID token, Instant startedAt,
                Instant completedAt, String reportJson, String failureCode,
                String latestAttemptReportJson, Instant latestAttemptCompletedAt) {
            this(key, contextHash, state, token, startedAt, completedAt, reportJson, failureCode,
                latestAttemptReportJson, latestAttemptCompletedAt, null, null, null, null);
        }
    }
    public record Claim(Job job, boolean acquired) { }

    public Optional<Job> find(String key) {
        return jdbc.query("SELECT * FROM ai_review_jobs WHERE cache_key = ?", (rs, n) -> new Job(
            rs.getString("cache_key"), rs.getString("context_sha256"), rs.getString("state"),
            rs.getObject("claim_token", UUID.class), rs.getTimestamp("started_at").toInstant(),
            rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant(),
            rs.getString("report_json"), rs.getString("failure_code"),
            rs.getString("latest_attempt_report_json"), rs.getTimestamp("latest_attempt_completed_at") == null ? null : rs.getTimestamp("latest_attempt_completed_at").toInstant(),
            rs.getString("failure_diagnostic_json"), rs.getObject("workspace_id", UUID.class), rs.getObject("deliverable_id", UUID.class), rs.getString("team_code")), key).stream().findFirst();
    }

    public Claim claim(String key, UUID workspaceId, UUID deliverableId, String team, String pdfHash,
                       String contextHash, UUID expectedRetryToken) {
        return claim(key, workspaceId, deliverableId, team, pdfHash, contextHash, expectedRetryToken, false);
    }

    public Claim claim(String key, UUID workspaceId, UUID deliverableId, String team, String pdfHash,
                       String contextHash, UUID expectedRetryToken, boolean rerunRequested) {
        return claim(key, workspaceId, deliverableId, team, pdfHash, contextHash, expectedRetryToken, rerunRequested, null);
    }

    public Claim claim(String key, UUID workspaceId, UUID deliverableId, String team, String pdfHash,
                       String contextHash, UUID expectedRetryToken, boolean rerunRequested, UUID expectedRerunToken) {
        UUID token = UUID.randomUUID();
        Job existing = find(key).orElse(null);
        if (existing == null) {
            try {
                tx.executeWithoutResult(status -> jdbc.update("""
                    INSERT INTO ai_review_jobs(cache_key, workspace_id, deliverable_id, team_code,
                        document_sha256, context_sha256, state, claim_token, started_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?)
                    """, key, workspaceId, deliverableId, team, pdfHash, contextHash, token, Timestamp.from(clock.instant())));
                return new Claim(find(key).orElseThrow(), true);
            } catch (DuplicateKeyException duplicate) {
                // The unique key arbitrates simultaneous requests across application instances.
            }
            existing = find(key).orElseThrow();
        }
        boolean abandoned = abandoned(existing);
        // Deliberate rerun is different from reusing an identical completed PDF
        // and from retrying an uncertain request. The CAS claim gives all five
        // students sharing this context ONE in-flight provider call across nodes.
        if (rerunRequested && existing.state().equals("COMPLETED") && expectedRetryToken == null
                && (expectedRerunToken == null || existing.token().equals(expectedRerunToken))) {
            Job prior = existing;
            int changed = tx.execute(status -> jdbc.update("""
                UPDATE ai_review_jobs SET state = 'RUNNING', claim_token = ?, started_at = ?,
                    failure_code = NULL, failure_diagnostic_json = NULL, heartbeat_at = NULL
                WHERE cache_key = ? AND claim_token = ? AND state = 'COMPLETED'
                """, token, Timestamp.from(clock.instant()), key, prior.token()));
            if (changed == 1) return new Claim(find(key).orElseThrow(), true);
            return new Claim(find(key).orElseThrow(), false);
        }
        if (existing.token().equals(expectedRetryToken) && (existing.state().equals("UNCERTAIN") || abandoned)) {
            Job prior = existing;
            int changed = tx.execute(status -> jdbc.update("""
                UPDATE ai_review_jobs SET state = 'RUNNING', claim_token = ?, started_at = ?,
                    failure_code = NULL, failure_diagnostic_json = NULL, heartbeat_at = NULL
                WHERE cache_key = ? AND claim_token = ? AND state = ?
                  AND (state <> 'RUNNING' OR COALESCE(heartbeat_at, started_at) < ?)
                """, token, Timestamp.from(clock.instant()), key, prior.token(), prior.state(),
                    Timestamp.from(clock.instant().minus(ABANDONED_AFTER))));
            if (changed == 1) return new Claim(find(key).orElseThrow(), true);
        }
        return new Claim(find(key).orElseThrow(), false);
    }

    public void preservePreviousResults(Job claimed, Job previous) {
        String latest = previous.latestAttemptReportJson() != null
            ? previous.latestAttemptReportJson() : previous.reportJson();
        Instant latestAt = previous.latestAttemptCompletedAt() != null
            ? previous.latestAttemptCompletedAt() : previous.completedAt();
        if (latest == null) return;
        // A changed prompt/config gets its own job, while identical bytes retain dated
        // history. Different documents/scopes and late workers cannot seed this job.
        tx.executeWithoutResult(status -> jdbc.update("""
            UPDATE ai_review_jobs SET report_json = ?, completed_at = ?,
                latest_attempt_report_json = ?, latest_attempt_completed_at = ?
            WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING'
              AND report_json IS NULL AND latest_attempt_report_json IS NULL
              AND workspace_id = ? AND deliverable_id = ? AND team_code = ?
              AND document_sha256 = (SELECT document_sha256 FROM ai_review_jobs WHERE cache_key = ?)
            """, previous.reportJson(), previous.completedAt() == null ? null : Timestamp.from(previous.completedAt()),
            latest, latestAt == null ? null : Timestamp.from(latestAt), claimed.key(), claimed.token(),
            previous.workspaceId(), previous.deliverableId(), previous.teamCode(), previous.key()));
    }

    boolean abandoned(Job job) {
        if (!"RUNNING".equals(job.state())) return false;
        var times = jdbc.query("SELECT heartbeat_at FROM ai_review_jobs WHERE cache_key = ? AND claim_token = ?",
            (rs, row) -> rs.getTimestamp(1), job.key(), job.token());
        var heartbeat = times.isEmpty() || times.get(0) == null ? job.startedAt() : times.get(0).toInstant();
        return heartbeat.isBefore(clock.instant().minus(ABANDONED_AFTER));
    }

    void heartbeat(Job job) {
        int changed = jdbc.update("UPDATE ai_review_jobs SET heartbeat_at = ? WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING'",
            Timestamp.from(clock.instant()), job.key(), job.token());
        if (changed != 1) throw new IllegalStateException("This AI review no longer owns its claim.");
    }

    public void complete(Job job, String report) {
        complete(job, report, true);
    }

    public void complete(Job job, String report, boolean substantive) {
        complete(job, report, substantive, job.startedAt());
    }

    Instant captureTime() { return clock.instant(); }

    public void complete(Job job, String report, boolean substantive, Instant capturedAt) {
        Instant completed = clock.instant();
        String substantiveSql = substantive ? ", report_json = ?, completed_at = ?" : "";
        Object[] args = substantive
            ? new Object[] {report, Timestamp.from(completed), report, Timestamp.from(completed), job.key(), job.token()}
            : new Object[] {report, Timestamp.from(completed), job.key(), job.token()};
        tx.executeWithoutResult(status -> {
            int changed = jdbc.update("""
                UPDATE ai_review_jobs SET state = 'COMPLETED', latest_attempt_report_json = ?, latest_attempt_completed_at = ?, failure_code = NULL, failure_diagnostic_json = NULL
                WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING'
                """.replace("WHERE", substantiveSql + " WHERE"), args);
            if (changed == 1) {
                // This receipt belongs to the saved report's inspected input.
                // A failed or superseded worker must never advance it.
                jdbc.update("UPDATE ai_review_response_links SET source_verified_at = ? WHERE cache_key = ?",
                    Timestamp.from(capturedAt), job.key());
                jdbc.update("UPDATE ai_review_field_links SET source_verified_at = ? WHERE cache_key = ?",
                    Timestamp.from(capturedAt), job.key());
            }
        });
    }

    public void uncertain(Job job) { uncertain(job, "PROVIDER_OUTCOME_UNKNOWN", null); }

    public void uncertain(Job job, String failureCode) { uncertain(job, failureCode, null); }

    public void uncertain(Job job, String failureCode, String diagnosticJson) {
        tx.executeWithoutResult(status -> jdbc.update("""
            UPDATE ai_review_jobs SET state = 'UNCERTAIN', failure_code = ?, failure_diagnostic_json = ?
            WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING'
            """, failureCode, diagnosticJson, job.key(), job.token()));
    }

    public void link(UUID responseId, long revision, String key) {
        link(responseId, revision, key, clock.instant());
    }

    public void link(UUID responseId, long revision, String key, Instant capturedAt) {
        try {
            tx.executeWithoutResult(status -> jdbc.update("""
                INSERT INTO ai_review_response_links(response_id, source_revision, cache_key, source_verified_at)
                VALUES (?, ?, ?, CASE WHEN EXISTS (
                    SELECT 1 FROM ai_review_jobs WHERE cache_key = ? AND state = 'COMPLETED'
                ) THEN CAST(? AS TIMESTAMP WITH TIME ZONE) ELSE NULL END)
                """, responseId, revision, key, key, Timestamp.from(capturedAt)));
        } catch (DuplicateKeyException duplicate) {
            tx.executeWithoutResult(status -> jdbc.update("""
                UPDATE ai_review_response_links SET source_verified_at = CASE
                    WHEN EXISTS (SELECT 1 FROM ai_review_jobs WHERE cache_key = ? AND state = 'COMPLETED')
                        THEN CAST(? AS TIMESTAMP WITH TIME ZONE)
                    WHEN cache_key = ? AND source_revision = ? THEN source_verified_at ELSE NULL END,
                    source_revision = ?, cache_key = ?
                WHERE response_id = ? AND source_revision <= ?
                """, key, Timestamp.from(capturedAt), key, revision, revision, key, responseId, revision));
        }
    }

    public Optional<Job> linked(UUID responseId, long revision) {
        return jdbc.query("SELECT cache_key FROM ai_review_response_links WHERE response_id = ? AND source_revision = ?",
            (rs, n) -> rs.getString(1), responseId, revision).stream().findFirst().flatMap(this::find);
    }

    public void unlink(UUID responseId, long revision, String key) {
        tx.executeWithoutResult(status -> jdbc.update(
            "DELETE FROM ai_review_response_links WHERE response_id = ? AND source_revision = ? AND cache_key = ?",
            responseId, revision, key));
    }

    public record Link(long revision, Job job, Instant sourceVerifiedAt) {
        public Link(long revision, Job job) { this(revision, job, null); }
    }
    public Map<UUID, Link> linkedFor(List<UUID> ids) {
        Map<UUID, Link> result = new HashMap<>();
        for (int offset = 0; offset < ids.size(); offset += 500) {
            var batch = ids.subList(offset, Math.min(offset + 500, ids.size()));
            String placeholders = String.join(",", java.util.Collections.nCopies(batch.size(), "?"));
            jdbc.query("SELECT l.response_id, l.source_revision, l.source_verified_at, j.* FROM ai_review_response_links l JOIN ai_review_jobs j ON j.cache_key = l.cache_key WHERE l.response_id IN (" + placeholders + ")", rs -> {
                Job job = new Job(rs.getString("cache_key"), rs.getString("context_sha256"), rs.getString("state"),
                    rs.getObject("claim_token", UUID.class), rs.getTimestamp("started_at").toInstant(),
                    rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant(),
                    rs.getString("report_json"), rs.getString("failure_code"),
                    rs.getString("latest_attempt_report_json"), rs.getTimestamp("latest_attempt_completed_at") == null ? null : rs.getTimestamp("latest_attempt_completed_at").toInstant(),
            rs.getString("failure_diagnostic_json"), rs.getObject("workspace_id", UUID.class), rs.getObject("deliverable_id", UUID.class), rs.getString("team_code"));
                result.put(rs.getObject("response_id", UUID.class), new Link(rs.getLong("source_revision"), job,
                    rs.getTimestamp("source_verified_at") == null ? null : rs.getTimestamp("source_verified_at").toInstant()));
            }, batch.toArray());
        }
        return result;
    }

    public void linkField(UUID responseId, String fieldId, String sourceValueHash, String key) {
        linkField(responseId, fieldId, sourceValueHash, key, clock.instant());
    }

    public void linkField(UUID responseId, String fieldId, String sourceValueHash, String key, Instant capturedAt) {
        try {
            tx.executeWithoutResult(status -> jdbc.update("""
                INSERT INTO ai_review_field_links(response_id, field_id, source_value_sha256, cache_key, source_verified_at)
                VALUES (?, ?, ?, ?, CASE WHEN EXISTS (
                    SELECT 1 FROM ai_review_jobs WHERE cache_key = ? AND state = 'COMPLETED'
                ) THEN CAST(? AS TIMESTAMP WITH TIME ZONE) ELSE NULL END)
                """, responseId, fieldId, sourceValueHash, key, key, Timestamp.from(capturedAt)));
        } catch (DuplicateKeyException duplicate) {
            tx.executeWithoutResult(status -> jdbc.update("""
                UPDATE ai_review_field_links SET source_verified_at = CASE
                    WHEN EXISTS (SELECT 1 FROM ai_review_jobs WHERE cache_key = ? AND state = 'COMPLETED')
                        THEN CAST(? AS TIMESTAMP WITH TIME ZONE)
                    WHEN cache_key = ? AND source_value_sha256 = ? THEN source_verified_at ELSE NULL END,
                    source_value_sha256 = ?, cache_key = ?
                WHERE response_id = ? AND field_id = ?
                """, key, Timestamp.from(capturedAt), key, sourceValueHash, sourceValueHash, key, responseId, fieldId));
        }
    }

    public Optional<Job> linkedField(UUID responseId, String fieldId, String sourceValueHash) {
        return jdbc.query("""
            SELECT cache_key FROM ai_review_field_links
            WHERE response_id = ? AND field_id = ? AND source_value_sha256 = ?
            """, (rs, n) -> rs.getString(1), responseId, fieldId, sourceValueHash)
            .stream().findFirst().flatMap(this::find);
    }

    public void unlinkField(UUID responseId, String fieldId, String sourceValueHash, String key) {
        tx.executeWithoutResult(status -> jdbc.update("""
            DELETE FROM ai_review_field_links
            WHERE response_id = ? AND field_id = ? AND source_value_sha256 = ? AND cache_key = ?
            """, responseId, fieldId, sourceValueHash, key));
    }

    public record FieldLink(String sourceValueHash, Job job, Instant sourceVerifiedAt) {
        public FieldLink(String sourceValueHash, Job job) { this(sourceValueHash, job, null); }
    }

    public Map<UUID, Map<String, FieldLink>> linkedFieldsFor(List<UUID> ids) {
        Map<UUID, Map<String, FieldLink>> result = new HashMap<>();
        for (int offset = 0; offset < ids.size(); offset += 500) {
            var batch = ids.subList(offset, Math.min(offset + 500, ids.size()));
            if (batch.isEmpty()) continue;
            String placeholders = String.join(",", java.util.Collections.nCopies(batch.size(), "?"));
            jdbc.query("""
                SELECT l.response_id, l.field_id, l.source_value_sha256, l.source_verified_at, j.*
                FROM ai_review_field_links l JOIN ai_review_jobs j ON j.cache_key = l.cache_key
                WHERE l.response_id IN (""" + placeholders + ")", rs -> {
                Job job = new Job(rs.getString("cache_key"), rs.getString("context_sha256"), rs.getString("state"),
                    rs.getObject("claim_token", UUID.class), rs.getTimestamp("started_at").toInstant(),
                    rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant(),
                    rs.getString("report_json"), rs.getString("failure_code"),
                    rs.getString("latest_attempt_report_json"), rs.getTimestamp("latest_attempt_completed_at") == null ? null : rs.getTimestamp("latest_attempt_completed_at").toInstant(),
            rs.getString("failure_diagnostic_json"), rs.getObject("workspace_id", UUID.class), rs.getObject("deliverable_id", UUID.class), rs.getString("team_code"));
                result.computeIfAbsent(rs.getObject("response_id", UUID.class), ignored -> new HashMap<>())
                    .put(rs.getString("field_id"), new FieldLink(rs.getString("source_value_sha256"), job,
                        rs.getTimestamp("source_verified_at") == null ? null : rs.getTimestamp("source_verified_at").toInstant()));
            }, batch.toArray());
        }
        return result;
    }

    public String displayState(Job job) {
        return abandoned(job) ? "UNCERTAIN" : job.state();
    }

    public Instant sourceVerifiedAt(UUID responseId, String fieldId, String key, boolean legacy) {
        List<Instant> times = legacy ? List.of() : jdbc.query("""
            SELECT source_verified_at FROM ai_review_field_links
            WHERE response_id=? AND field_id=? AND cache_key=?
            """, (rs, n) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(), responseId, fieldId, key);
        if (times.isEmpty() && (legacy || fieldId.endsWith(":legacy"))) {
            times = jdbc.query("SELECT source_verified_at FROM ai_review_response_links WHERE response_id=? AND cache_key=?",
                (rs, n) -> rs.getTimestamp(1) == null ? null : rs.getTimestamp(1).toInstant(), responseId, key);
        }
        return times.isEmpty() ? null : times.get(0);
    }
}
