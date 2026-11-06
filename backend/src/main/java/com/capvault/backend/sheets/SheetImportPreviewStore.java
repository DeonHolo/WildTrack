package com.capvault.backend.sheets;

import com.capvault.backend.workspace.WorkspaceSourceType;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Joins the import transaction: a committed apply and its receipt cannot be separated. */
@Repository
public class SheetImportPreviewStore {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;

    public SheetImportPreviewStore(JdbcTemplate db, ObjectMapper json, Clock clock) {
        this.db = db; this.json = json; this.clock = clock;
    }

    public record Preview(UUID id, UUID workspaceId, WorkspaceSourceType sourceType, String actor,
                          SheetImportRequest request, String stateVersion, String sourceVersion,
                          Instant expiresAt, String resolutionsJson, SheetImportResponse result) { }

    @org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void purgeExpired() {
        // Release expired-row locks before a new preview acquires its workspace foreign-key lock.
        db.update("DELETE FROM sheet_import_previews WHERE expires_at <= ?", Timestamp.from(clock.instant()));
    }

    public void create(UUID id, UUID workspace, WorkspaceSourceType type, String actor,
                       SheetImportRequest request, String stateVersion, String sourceVersion) {
        Instant now = clock.instant();
        db.update("""
            INSERT INTO sheet_import_previews(id,workspace_id,source_type,actor_subject,request_json,
                state_version,source_version,expires_at) VALUES(?,?,?,?,?,?,?,?)
            """, id, workspace, type.name(), actor, encode(request), stateVersion, sourceVersion,
            Timestamp.from(now.plus(Duration.ofMinutes(30))));
    }

    public Optional<Preview> find(UUID id, boolean lock) {
        return db.query("SELECT * FROM sheet_import_previews WHERE id=?" + (lock ? " FOR UPDATE" : ""),
            (rs, n) -> new Preview(rs.getObject("id", UUID.class), rs.getObject("workspace_id", UUID.class),
                WorkspaceSourceType.valueOf(rs.getString("source_type")), rs.getString("actor_subject"),
                decode(rs.getString("request_json"), SheetImportRequest.class), rs.getString("state_version"),
                rs.getString("source_version"), rs.getTimestamp("expires_at").toInstant(),
                rs.getString("resolutions_json"), decode(rs.getString("result_json"), SheetImportResponse.class)), id)
            .stream().findFirst();
    }

    public boolean expired(Preview preview) { return !clock.instant().isBefore(preview.expiresAt()); }

    public String resolutions(Map<String, String> resolutions) {
        return encode(new TreeMap<>(resolutions == null ? Map.of() : resolutions));
    }

    public void applied(UUID id, String resolutions, SheetImportResponse result) {
        db.update("UPDATE sheet_import_previews SET resolutions_json=?,result_json=? WHERE id=?",
            resolutions, encode(result), id);
    }

    private String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalStateException("Sheet preview could not be saved.", e); }
    }
    private <T> T decode(String value, Class<T> type) {
        if (value == null) return null;
        try { return json.readValue(value, type); }
        catch (Exception e) { throw new IllegalStateException("Sheet preview could not be read.", e); }
    }
}
