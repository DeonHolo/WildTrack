package com.capvault.backend.aireview;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Durable student allowance. Changing an answer, file or Google account does not reset it. */
@Repository
public class StudentAiReviewRuns {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public StudentAiReviewRuns(JdbcTemplate jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }

    record Key(UUID workspaceId, UUID deliverableId, String studentNumber, String fieldId) {
        Key { studentNumber = studentNumber.trim().toLowerCase(Locale.ROOT); }
    }
    record Slot(String state, UUID token, String cacheKey) { }
    record Reservation(Key key, UUID token) { }

    boolean enabled(UUID workspaceId, UUID deliverableId) {
        return jdbc.query("SELECT enabled FROM student_ai_review_settings WHERE workspace_id = ? AND deliverable_id = ?",
            (rs, row) -> rs.getBoolean(1), workspaceId, deliverableId).stream().findFirst().orElse(false);
    }

    void configure(UUID workspaceId, UUID deliverableId, boolean enabled) {
        if (jdbc.update("UPDATE student_ai_review_settings SET enabled = ? WHERE workspace_id = ? AND deliverable_id = ?",
                enabled, workspaceId, deliverableId) == 0) {
            try {
                jdbc.update("INSERT INTO student_ai_review_settings(deliverable_id, workspace_id, enabled) VALUES (?, ?, ?)",
                    deliverableId, workspaceId, enabled);
            } catch (DuplicateKeyException raced) {
                jdbc.update("UPDATE student_ai_review_settings SET enabled = ? WHERE workspace_id = ? AND deliverable_id = ?",
                    enabled, workspaceId, deliverableId);
            }
        }
    }

    Slot slot(Key key) {
        var row = find(key);
        if (row == null || !"RUNNING".equals(row.state())) return row;
        if (row.cacheKey() != null) refreshJob(row.cacheKey());
        else jdbc.update("""
            UPDATE student_ai_review_runs SET state = 'RETRYABLE'
            WHERE workspace_id = ? AND deliverable_id = ? AND student_number = ? AND field_id = ?
              AND claim_token = ? AND state = 'RUNNING' AND cache_key IS NULL AND started_at < ?
            """, key.workspaceId(), key.deliverableId(), key.studentNumber(), key.fieldId(), row.token(),
            Timestamp.from(clock.instant().minus(Duration.ofMinutes(10))));
        return find(key);
    }

    private Slot find(Key key) {
        return jdbc.query("""
            SELECT state, claim_token, cache_key FROM student_ai_review_runs
            WHERE workspace_id = ? AND deliverable_id = ? AND student_number = ? AND field_id = ?
            """, (rs, row) -> new Slot(rs.getString(1), rs.getObject(2, UUID.class), rs.getString(3)),
            key.workspaceId(), key.deliverableId(), key.studentNumber(), key.fieldId()).stream().findFirst().orElse(null);
    }

    Reservation reserve(Key key) {
        var previous = slot(key);
        UUID token = UUID.randomUUID();
        var now = Timestamp.from(clock.instant());
        if (previous == null) {
            try {
                jdbc.update("""
                    INSERT INTO student_ai_review_runs(workspace_id, deliverable_id, student_number,
                        field_id, state, claim_token, started_at) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?)
                    """, key.workspaceId(), key.deliverableId(), key.studentNumber(), key.fieldId(), token, now);
                return new Reservation(key, token);
            } catch (DuplicateKeyException raced) { return null; }
        }
        if (!"RETRYABLE".equals(previous.state())) return null;
        int changed = jdbc.update("""
            UPDATE student_ai_review_runs SET state = 'RUNNING', claim_token = ?, cache_key = NULL, started_at = ?
            WHERE workspace_id = ? AND deliverable_id = ? AND student_number = ? AND field_id = ?
              AND state = 'RETRYABLE' AND claim_token = ?
            """, token, now, key.workspaceId(), key.deliverableId(), key.studentNumber(), key.fieldId(), previous.token());
        return changed == 1 ? new Reservation(key, token) : null;
    }

    void attach(Reservation reservation, String cacheKey) {
        var key = reservation.key();
        int changed = jdbc.update("""
            UPDATE student_ai_review_runs SET cache_key = ?
            WHERE workspace_id = ? AND deliverable_id = ? AND student_number = ? AND field_id = ?
              AND state = 'RUNNING' AND claim_token = ?
            """, cacheKey, key.workspaceId(), key.deliverableId(), key.studentNumber(), key.fieldId(), reservation.token());
        if (changed != 1) throw new IllegalStateException("This student AI Review request has already changed. Reload its status.");
        refreshJob(cacheKey);
    }

    void release(Reservation reservation) {
        var key = reservation.key();
        jdbc.update("""
            UPDATE student_ai_review_runs SET state = 'RETRYABLE'
            WHERE workspace_id = ? AND deliverable_id = ? AND student_number = ? AND field_id = ?
              AND state = 'RUNNING' AND claim_token = ? AND cache_key IS NULL
            """, key.workspaceId(), key.deliverableId(), key.studentNumber(), key.fieldId(), reservation.token());
        var current = find(key);
        if (current != null && current.cacheKey() != null) refreshJob(current.cacheKey());
    }

    void refreshJob(String cacheKey) {
        jdbc.update("""
            UPDATE student_ai_review_runs SET state = 'COMPLETED', completed_at = ?
            WHERE cache_key = ? AND state = 'RUNNING'
              AND EXISTS (SELECT 1 FROM ai_review_jobs j WHERE j.cache_key = ? AND j.state = 'COMPLETED')
            """, Timestamp.from(clock.instant()), cacheKey, cacheKey);
        jdbc.update("""
            UPDATE student_ai_review_runs SET state = 'RETRYABLE'
            WHERE cache_key = ? AND state = 'RUNNING'
              AND EXISTS (SELECT 1 FROM ai_review_jobs j WHERE j.cache_key = ?
                  AND (j.state = 'UNCERTAIN' OR (j.state = 'RUNNING' AND COALESCE(j.heartbeat_at, j.started_at) < ?)))
            """, cacheKey, cacheKey, Timestamp.from(clock.instant().minus(Duration.ofMinutes(10))));
    }
}
