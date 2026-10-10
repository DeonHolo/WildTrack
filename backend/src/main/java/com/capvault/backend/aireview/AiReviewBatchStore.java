package com.capvault.backend.aireview;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Committed state and expiring CAS leases; never hold a transaction across Drive/Gemini I/O. */
@Repository
public class AiReviewBatchStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate tx;
    record Row(UUID id, UUID workspaceId, String subject, String state, AiReviewBatchService.Data data,
               long version, Instant updatedAt, UUID leaseToken) { }

    public AiReviewBatchStore(JdbcTemplate jdbc, ObjectMapper json, Clock clock, PlatformTransactionManager manager) {
        this.jdbc = jdbc; this.json = json; this.clock = clock; this.tx = new TransactionTemplate(manager);
    }

    Optional<Row> find(UUID id, UUID workspace) {
        return query("SELECT * FROM ai_review_batches WHERE id = ? AND workspace_id = ?", id, workspace).stream().findFirst();
    }

    Optional<Row> latest(UUID workspace) {
        return query("SELECT * FROM ai_review_batches WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1", workspace).stream().findFirst();
    }

    Optional<Row> running(UUID workspace) {
        return query("SELECT * FROM ai_review_batches WHERE workspace_id = ? AND state = 'RUNNING' ORDER BY created_at LIMIT 1", workspace).stream().findFirst();
    }

    Row create(UUID workspace, String subject, AiReviewBatchService.Data data) {
        return tx.execute(status -> {
            // The workspace row serializes batch creation/start across application instances.
            jdbc.queryForObject("SELECT id FROM academic_workspaces WHERE id = ? FOR UPDATE", UUID.class, workspace);
            var active = running(workspace);
            if (active.isPresent()) return active.get();
            UUID id = UUID.randomUUID();
            var now = Timestamp.from(clock.instant());
            jdbc.update("INSERT INTO ai_review_batches(id, workspace_id, requested_by, state, payload_json, created_at, updated_at) VALUES (?, ?, ?, 'PLANNING', ?, ?, ?)",
                id, workspace, subject, encode(data), now, now);
            return find(id, workspace).orElseThrow();
        });
    }

    Optional<Row> leaseNext() {
        var now = Timestamp.from(clock.instant());
        for (var row : query("SELECT * FROM ai_review_batches WHERE state IN ('PLANNING', 'RUNNING') AND (lease_until IS NULL OR lease_until < ?) ORDER BY created_at LIMIT 10", now)) {
            UUID token = UUID.randomUUID();
            int changed = jdbc.update("UPDATE ai_review_batches SET lease_token = ?, lease_until = ? WHERE id = ? AND version = ? AND state = ? AND (lease_until IS NULL OR lease_until < ?)",
                token, Timestamp.from(clock.instant().plus(Duration.ofMinutes(5))), row.id(), row.version(), row.state(), now);
            if (changed == 1) return find(row.id(), row.workspaceId());
        }
        return Optional.empty();
    }

    boolean saveLeased(Row row, String state, AiReviewBatchService.Data data) {
        return jdbc.update("UPDATE ai_review_batches SET state = ?, payload_json = ?, version = version + 1, updated_at = ?, lease_token = NULL, lease_until = NULL WHERE id = ? AND version = ? AND lease_token = ? AND state = ?",
            state, encode(data), Timestamp.from(clock.instant()), row.id(), row.version(), row.leaseToken(), row.state()) == 1;
    }

    Optional<Row> checkpoint(Row row, AiReviewBatchService.Data data) {
        int changed = jdbc.update("UPDATE ai_review_batches SET payload_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND lease_token = ? AND state = ?",
            encode(data), Timestamp.from(clock.instant()), row.id(), row.version(), row.leaseToken(), row.state());
        return changed == 1 ? find(row.id(), row.workspaceId()) : Optional.empty();
    }

    boolean action(Row row, String state, AiReviewBatchService.Data data) {
        return tx.execute(status -> {
            jdbc.queryForObject("SELECT id FROM academic_workspaces WHERE id = ? FOR UPDATE", UUID.class, row.workspaceId());
            if ("RUNNING".equals(state)) {
                var other = running(row.workspaceId());
                if (other.isPresent() && !other.get().id().equals(row.id())) return false;
            }
            return jdbc.update("UPDATE ai_review_batches SET state = ?, payload_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND state = ? AND lease_token IS NULL",
                state, encode(data), Timestamp.from(clock.instant()), row.id(), row.version(), row.state()) == 1;
        });
    }
    boolean cancelPreparation(Row row) {
        return jdbc.update("UPDATE ai_review_batches SET state = 'CANCELLED', version = version + 1, updated_at = ?, lease_token = NULL, lease_until = NULL WHERE id = ? AND version = ? AND state IN ('PLANNING', 'READY')",
            Timestamp.from(clock.instant()), row.id(), row.version()) == 1;
    }



    private List<Row> query(String sql, Object... args) {
        return jdbc.query(sql, (rs, n) -> {
            try {
                return new Row(rs.getObject("id", UUID.class), rs.getObject("workspace_id", UUID.class), rs.getString("requested_by"),
                    rs.getString("state"), json.readValue(rs.getString("payload_json"), AiReviewBatchService.Data.class),
                    rs.getLong("version"), rs.getTimestamp("updated_at").toInstant(), rs.getObject("lease_token", UUID.class));
            } catch (Exception corrupt) { throw new IllegalStateException("Saved AI batch could not be read."); }
        }, args);
    }

    private String encode(AiReviewBatchService.Data data) {
        try { return json.writeValueAsString(data); }
        catch (Exception invalid) { throw new IllegalArgumentException("AI batch could not be saved."); }
    }
}
