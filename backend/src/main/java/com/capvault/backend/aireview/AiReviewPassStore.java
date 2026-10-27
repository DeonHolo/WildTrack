package com.capvault.backend.aireview;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** A completed bounded assessment is retained even when a later paid request fails. */
@Repository
public class AiReviewPassStore {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public AiReviewPassStore(JdbcTemplate db, ObjectMapper json) { this.db = db; this.json = json; }

    public void copyCompleted(AiReviewStore.Job current, UUID previous) {
        if (previous == null || previous.equals(current.token())) return;
        db.update("""
            INSERT INTO ai_review_instruction_passes(cache_key, run_token, pass_number, input_sha256, state, report_json, completed_at)
            SELECT cache_key, ?, pass_number, input_sha256, 'COMPLETED', report_json, completed_at
            FROM ai_review_instruction_passes WHERE cache_key = ? AND run_token = ? AND state = 'COMPLETED'
            ON CONFLICT DO NOTHING
            """, current.token(), current.key(), previous);
    }

    public Optional<AiReviewProvider.Result> completed(AiReviewStore.Job job, int number, String inputHash) {
        var rows = db.query("""
            SELECT input_sha256, state, report_json FROM ai_review_instruction_passes
            WHERE cache_key = ? AND run_token = ? AND pass_number = ?
            """, (rs, row) -> new Saved(rs.getString(1), rs.getString(2), rs.getString(3)), job.key(), job.token(), number);
        if (rows.isEmpty()) return Optional.empty();
        var saved = rows.get(0);
        if (!inputHash.equals(saved.hash())) throw new IllegalStateException("AI review checkpoint context changed.");
        if (!"COMPLETED".equals(saved.state())) throw new IllegalStateException("An unfinished paid request requires a confirmed retry.");
        try { return Optional.of(json.readValue(saved.report(), AiReviewProvider.Result.class)); }
        catch (Exception failure) { throw new IllegalStateException("Saved AI review checkpoint is unreadable."); }
    }

    public void start(AiReviewStore.Job job, int number, String inputHash) {
        int changed = db.update("""
            INSERT INTO ai_review_instruction_passes(cache_key, run_token, pass_number, input_sha256, state)
            SELECT ?, ?, ?, ?, 'STARTED' WHERE EXISTS (
                SELECT 1 FROM ai_review_jobs WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING')
            ON CONFLICT DO NOTHING
            """, job.key(), job.token(), number, inputHash, job.key(), job.token());
        if (changed != 1) throw new IllegalStateException("AI review pass could not acquire its checkpoint.");
    }

    public void complete(AiReviewStore.Job job, int number, String inputHash, AiReviewProvider.Result result) {
        String value;
        try { value = json.writeValueAsString(result); }
        catch (Exception failure) { throw new IllegalStateException("AI review checkpoint could not be encoded."); }
        int changed = db.update("""
            UPDATE ai_review_instruction_passes SET state = 'COMPLETED', report_json = ?, completed_at = CURRENT_TIMESTAMP
            WHERE cache_key = ? AND run_token = ? AND pass_number = ? AND input_sha256 = ? AND state = 'STARTED'
              AND EXISTS (SELECT 1 FROM ai_review_jobs WHERE cache_key = ? AND claim_token = ? AND state = 'RUNNING')
            """, value, job.key(), job.token(), number, inputHash, job.key(), job.token());
        if (changed != 1) throw new IllegalStateException("AI review checkpoint was superseded.");
    }
    private record Saved(String hash, String state, String report) { }
}
