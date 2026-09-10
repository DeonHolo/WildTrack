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
                      Instant completedAt, String reportJson, String failureCode) { }
    public record Claim(Job job, boolean acquired) { }

    public Optional<Job> find(String key) {
        return jdbc.query("SELECT * FROM ai_review_jobs WHERE cache_key = ?", (rs, n) -> new Job(
            rs.getString("cache_key"), rs.getString("context_sha256"), rs.getString("state"),
            rs.getObject("claim_token", UUID.class), rs.getTimestamp("started_at").toInstant(),
            rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant(),
            rs.getString("report_json"), rs.getString("failure_code")), key).stream().findFirst();
    }

    public Claim claim(String key, UUID workspaceId, UUID deliverableId, String team, String pdfHash,
                       String contextHash, UUID expectedRetryToken) {
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
        boolean abandoned = existing.state().equals("RUNNING") && existing.startedAt().isBefore(clock.instant().minus(ABANDONED_AFTER));
        if (existing.token().equals(expectedRetryToken) && (existing.state().equals("UNCERTAIN") || abandoned)) {
            Job prior = existing;
            int changed = tx.execute(status -> jdbc.update("""
                UPDATE ai_review_jobs SET state = 'RUNNING', claim_token = ?, started_at = ?,
                    completed_at = NULL, report_json = NULL, failure_code = NULL
                WHERE cache_key = ? AND claim_token = ? AND state = ?
                """, token, Timestamp.from(clock.instant()), key, prior.token(), prior.state()));
            if (changed == 1) return new Claim(find(key).orElseThrow(), true);
        }
        return new Claim(find(key).orElseThrow(), false);
    }

    public void complete(Job job, String report) {
        tx.executeWithoutResult(status -> jdbc.update("""
            UPDATE ai_review_jobs SET state = 'COMPLETED', report_json = ?, completed_at = ?, failure_code = NULL
            WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING'
            """, report, Timestamp.from(clock.instant()), job.key(), job.token()));
    }

    public void uncertain(Job job) {
        uncertain(job, "PROVIDER_OUTCOME_UNKNOWN");
    }

    public void uncertain(Job job, String failureCode) {
        tx.executeWithoutResult(status -> jdbc.update("""
            UPDATE ai_review_jobs SET state = 'UNCERTAIN', failure_code = ?
            WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING'
            """, failureCode, job.key(), job.token()));
    }

    public void link(UUID responseId, long revision, String key) {
        try {
            tx.executeWithoutResult(status -> jdbc.update(
                "INSERT INTO ai_review_response_links(response_id, source_revision, cache_key) VALUES (?, ?, ?)", responseId, revision, key));
        } catch (DuplicateKeyException duplicate) {
            tx.executeWithoutResult(status -> jdbc.update("""
                UPDATE ai_review_response_links SET source_revision = ?, cache_key = ?
                WHERE response_id = ? AND source_revision <= ?
                """, revision, key, responseId, revision));
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

    public record Link(long revision, Job job) { }
    public Map<UUID, Link> linkedFor(List<UUID> ids) {
        Map<UUID, Link> result = new HashMap<>();
        for (int offset = 0; offset < ids.size(); offset += 500) {
            var batch = ids.subList(offset, Math.min(offset + 500, ids.size()));
            String placeholders = String.join(",", java.util.Collections.nCopies(batch.size(), "?"));
            jdbc.query("SELECT l.response_id, l.source_revision, j.* FROM ai_review_response_links l JOIN ai_review_jobs j ON j.cache_key = l.cache_key WHERE l.response_id IN (" + placeholders + ")", rs -> {
                Job job = new Job(rs.getString("cache_key"), rs.getString("context_sha256"), rs.getString("state"),
                    rs.getObject("claim_token", UUID.class), rs.getTimestamp("started_at").toInstant(),
                    rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant(),
                    rs.getString("report_json"), rs.getString("failure_code"));
                result.put(rs.getObject("response_id", UUID.class), new Link(rs.getLong("source_revision"), job));
            }, batch.toArray());
        }
        return result;
    }

    public void linkField(UUID responseId, String fieldId, String sourceValueHash, String key) {
        try {
            tx.executeWithoutResult(status -> jdbc.update("""
                INSERT INTO ai_review_field_links(response_id, field_id, source_value_sha256, cache_key)
                VALUES (?, ?, ?, ?)
                """, responseId, fieldId, sourceValueHash, key));
        } catch (DuplicateKeyException duplicate) {
            tx.executeWithoutResult(status -> jdbc.update("""
                UPDATE ai_review_field_links SET source_value_sha256 = ?, cache_key = ?
                WHERE response_id = ? AND field_id = ?
                """, sourceValueHash, key, responseId, fieldId));
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

    public record FieldLink(String sourceValueHash, Job job) { }

    public Map<UUID, Map<String, FieldLink>> linkedFieldsFor(List<UUID> ids) {
        Map<UUID, Map<String, FieldLink>> result = new HashMap<>();
        for (int offset = 0; offset < ids.size(); offset += 500) {
            var batch = ids.subList(offset, Math.min(offset + 500, ids.size()));
            if (batch.isEmpty()) continue;
            String placeholders = String.join(",", java.util.Collections.nCopies(batch.size(), "?"));
            jdbc.query("""
                SELECT l.response_id, l.field_id, l.source_value_sha256, j.*
                FROM ai_review_field_links l JOIN ai_review_jobs j ON j.cache_key = l.cache_key
                WHERE l.response_id IN (""" + placeholders + ")", rs -> {
                Job job = new Job(rs.getString("cache_key"), rs.getString("context_sha256"), rs.getString("state"),
                    rs.getObject("claim_token", UUID.class), rs.getTimestamp("started_at").toInstant(),
                    rs.getTimestamp("completed_at") == null ? null : rs.getTimestamp("completed_at").toInstant(),
                    rs.getString("report_json"), rs.getString("failure_code"));
                result.computeIfAbsent(rs.getObject("response_id", UUID.class), ignored -> new HashMap<>())
                    .put(rs.getString("field_id"), new FieldLink(rs.getString("source_value_sha256"), job));
            }, batch.toArray());
        }
        return result;
    }

    public String displayState(Job job) {
        return job.state().equals("RUNNING") && job.startedAt().isBefore(clock.instant().minus(ABANDONED_AFTER))
            ? "UNCERTAIN" : job.state();
    }
}
