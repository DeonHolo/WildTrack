package com.capvault.backend.archive;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable progress; Drive calls never run inside a batch-state transaction. */
@Repository
public class ArchiveBatchStore {
    record Row(UUID id, UUID workspaceId, String actor, String state, ArchiveBatchService.Data data,
               long version, UUID leaseToken) { }
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate tx;

    public ArchiveBatchStore(JdbcTemplate jdbc, ObjectMapper json, Clock clock, PlatformTransactionManager manager) {
        this.jdbc = jdbc; this.json = json; this.clock = clock; this.tx = new TransactionTemplate(manager);
    }
    Optional<Row> latest(UUID workspace) {
        return query("SELECT * FROM archive_batches WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", workspace).stream().findFirst();
    }
    Optional<Row> find(UUID workspace, UUID id) {
        return query("SELECT * FROM archive_batches WHERE workspace_id = ? AND id = ?", workspace, id).stream().findFirst();
    }
    Row create(UUID workspace, String actor, ArchiveBatchService.Data data) {
        return tx.execute(status -> {
            lockWorkspace(workspace);
            var latest = latest(workspace);
            if (latest.filter(row -> busy(row.state())).isPresent()) return latest.get();
            if (jdbc.queryForObject("SELECT COUNT(*) FROM archive_records WHERE workspace_id = ? AND capture_state IN ('QUEUED','COPYING')", Long.class, workspace) > 0)
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "PDFs are already being archived. Wait for copying to finish.");
            latest.filter(row -> row.state().equals("READY")).ifPresent(row -> jdbc.update(
                "UPDATE archive_batches SET state = 'SUPERSEDED', version = version + 1 WHERE id = ?", row.id()));
            var id = UUID.randomUUID(); var now = Timestamp.from(clock.instant());
            jdbc.update("INSERT INTO archive_batches(id, workspace_id, requested_by, state, payload_json, created_at, updated_at) VALUES (?, ?, ?, 'CHECKING', ?, ?, ?)",
                id, workspace, actor, encode(data), now, now);
            return find(workspace, id).orElseThrow();
        });
    }
    Row start(UUID workspace, UUID id, long version) {
        return tx.execute(status -> {
            lockWorkspace(workspace);
            var row = find(workspace, id).orElseThrow(() -> new IllegalArgumentException("Archive preparation not found."));
            if (row.state().equals("ARCHIVING") || row.state().equals("COMPLETE")) return row;
            if (!row.state().equals("READY") || row.version() != version || row.data().items().stream().noneMatch(ArchiveBatchService.Item::ready))
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "The archive summary changed. Open it again before archiving.");
            jdbc.update("UPDATE archive_batches SET state = 'ARCHIVING', version = version + 1, updated_at = ? WHERE id = ?",
                Timestamp.from(clock.instant()), id);
            return find(workspace, id).orElseThrow();
        });
    }
    Optional<Row> claim() {
        var now = Timestamp.from(clock.instant());
        for (var row : query("SELECT * FROM archive_batches WHERE state IN ('CHECKING','ARCHIVING') AND (lease_until IS NULL OR lease_until < ?) ORDER BY updated_at LIMIT 10", now)) {
            UUID token = UUID.randomUUID();
            if (jdbc.update("UPDATE archive_batches SET lease_token = ?, lease_until = ? WHERE id = ? AND version = ? AND (lease_until IS NULL OR lease_until < ?)",
                    token, Timestamp.from(clock.instant().plus(Duration.ofMinutes(10))), row.id(), row.version(), now) == 1)
                return find(row.workspaceId(), row.id());
        }
        return Optional.empty();
    }
    boolean save(Row row, String state, ArchiveBatchService.Data data) {
        return jdbc.update("UPDATE archive_batches SET state = ?, payload_json = ?, version = version + 1, updated_at = ?, lease_token = NULL, lease_until = NULL WHERE id = ? AND version = ? AND lease_token = ?",
            state, encode(data), Timestamp.from(clock.instant()), row.id(), row.version(), row.leaseToken()) == 1;
    }
    static boolean busy(String state) { return state.equals("CHECKING") || state.equals("ARCHIVING"); }
    private void lockWorkspace(UUID workspace) {
        jdbc.queryForObject("SELECT id FROM academic_workspaces WHERE id = ? FOR UPDATE", UUID.class, workspace);
    }
    private List<Row> query(String sql, Object... args) {
        return jdbc.query(sql, (rs, n) -> {
            try {
                return new Row(rs.getObject("id", UUID.class), rs.getObject("workspace_id", UUID.class), rs.getString("requested_by"),
                    rs.getString("state"), json.readValue(rs.getString("payload_json"), ArchiveBatchService.Data.class),
                    rs.getLong("version"), rs.getObject("lease_token", UUID.class));
            } catch (java.io.IOException invalid) { throw new IllegalStateException("Saved archive progress could not be read."); }
        }, args);
    }
    private String encode(ArchiveBatchService.Data data) {
        try { return json.writeValueAsString(data); }
        catch (java.io.IOException invalid) { throw new IllegalArgumentException("Archive progress could not be saved."); }
    }
}
