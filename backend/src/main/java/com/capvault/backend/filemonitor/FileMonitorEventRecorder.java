package com.capvault.backend.filemonitor;

import com.capvault.backend.drive.DriveFileMetadata;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Durable writer for the file-monitor state and Today's Work events. */
@Service
public class FileMonitorEventRecorder {
    private final JdbcTemplate db;

    public FileMonitorEventRecorder(JdbcTemplate db) { this.db = db; }

    public void recordEvent(UUID workspaceId, String fileId, String kind,
            String before, String after, String detail, DriveFileMetadata metadata) {
        recordEvent(workspaceId, fileId, kind, before, after, detail, metadata, Instant.now());
    }

    /** One short transaction owns every report, event and scheduling write for this observation. */
    @Transactional
    public int publishCurrent(UUID workspaceId, String fileId, UUID claimToken,
            Instant observedAt, java.util.function.IntSupplier publish) {
        observedAt = normalizeObservedAt(observedAt);
        List<Boolean> current = db.query("""
            SELECT (claim_token = ?) AND (last_checked_at IS NULL OR last_checked_at < ?)
            FROM monitored_drive_files WHERE workspace_id=? AND file_id=? FOR UPDATE
            """, (rs, n) -> rs.getBoolean(1), claimToken, Timestamp.from(observedAt), workspaceId, fileId);
        if (current.isEmpty() || !current.get(0)) return 0;
        return publish.getAsInt();
    }

    public void recordEvent(UUID workspaceId, String fileId, String kind,
            String before, String after, String detail, DriveFileMetadata metadata, Instant observedAt) {
        List<Boolean> same = db.query("""
            SELECT kind,previous_checksum,current_checksum FROM monitored_drive_events
            WHERE workspace_id=? AND file_id=? ORDER BY observed_at DESC LIMIT 1
            """, (rs, n) -> kind.equals(rs.getString("kind"))
                && Objects.equals(before, rs.getString("previous_checksum"))
                && Objects.equals(after, rs.getString("current_checksum")), workspaceId, fileId);
        if (!same.isEmpty() && same.get(0)) return;
        db.update("""
            INSERT INTO monitored_drive_events(id,workspace_id,file_id,kind,previous_checksum,
              current_checksum,detail,observed_at,provider_modified_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            """, UUID.randomUUID(), workspaceId, fileId, kind, before, after, detail,
            Timestamp.from(normalizeObservedAt(observedAt)), metadata != null && metadata.modifiedTime() != null
                ? Timestamp.from(metadata.modifiedTime().toInstant()) : null);
    }

    /** Advances the shared baseline only for a newer, verified checksum observation. */
    @Transactional
    public void recordVerifiedContentChange(UUID workspaceId, String fileId, String sourceUrl,
            DriveFileMetadata metadata, Instant observedAt) {
        recordVerifiedContentChange(workspaceId, fileId, sourceUrl, metadata, observedAt, null);
    }

    @Transactional
    public void recordVerifiedContentChange(UUID workspaceId, String fileId, String sourceUrl,
            DriveFileMetadata metadata, Instant observedAt, UUID responseId) {
        if (workspaceId == null || fileId == null || fileId.isBlank() || metadata == null
                || metadata.md5Checksum() == null || metadata.md5Checksum().isBlank()
                || observedAt == null) return;
        observedAt = normalizeObservedAt(observedAt);
        String current = normalize(metadata.md5Checksum());
        int inserted = db.update("""
            INSERT INTO monitored_drive_files(workspace_id,file_id,source_url,next_check_at)
            VALUES(?,?,?,?) ON CONFLICT DO NOTHING
            """, workspaceId, fileId, sourceUrl == null ? "" : sourceUrl,
            Timestamp.from(observedAt));
        var state = db.queryForMap("""
            SELECT last_checksum,last_checked_at FROM monitored_drive_files
            WHERE workspace_id=? AND file_id=? FOR UPDATE
            """, workspaceId, fileId);
        if (responseId != null) {
            // Read the database under the same lock order as scheduled publication.
            // A JPA entity may still contain its pre-download current-response flag.
            var active = db.query("""
                SELECT current_student_key IS NOT NULL FROM form_responses
                WHERE id=? AND workspace_id=? FOR UPDATE
                """, (rs, n) -> rs.getBoolean(1), responseId, workspaceId);
            if (active.isEmpty() || !active.getFirst()) {
                if (inserted == 1) db.update("DELETE FROM monitored_drive_files WHERE workspace_id=? AND file_id=?",
                    workspaceId, fileId);
                return;
            }
        }
        String before = normalize((String) state.get("last_checksum"));
        Object value = state.get("last_checked_at");
        Timestamp checkedAt = value instanceof Timestamp timestamp ? timestamp
            : value instanceof java.time.OffsetDateTime offset ? Timestamp.from(offset.toInstant())
            : value instanceof Instant instant ? Timestamp.from(instant) : null;
        if (checkedAt != null && !observedAt.isAfter(checkedAt.toInstant())) return;

        db.update("""
            UPDATE monitored_drive_files SET source_url=?,last_checksum=?,last_checked_at=?,
                last_mime=?,last_modified_at=?,last_accessible=?
            WHERE workspace_id=? AND file_id=?
            """, sourceUrl == null ? "" : sourceUrl, current, Timestamp.from(observedAt),
            metadata.mimeType(), metadata.modifiedTime() == null ? null : Timestamp.from(metadata.modifiedTime().toInstant()),
            metadata.canDownload(),
            workspaceId, fileId);
        // Rechecks advance the freshness watermark, never an existing alert's date or ID.
        if (before == null || before.equals(current)) return;
        db.update("""
            INSERT INTO monitored_drive_events(id,workspace_id,file_id,kind,previous_checksum,
              current_checksum,detail,observed_at,provider_modified_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            """, UUID.randomUUID(), workspaceId, fileId, "CONTENT_CHANGED", before, current,
            "The submitted file has a new verified content identity. Review its Document Check and history.",
            Timestamp.from(observedAt), metadata.modifiedTime() == null ? null
                : Timestamp.from(metadata.modifiedTime().toInstant()));
    }

    /** Metadata without verified bytes must not advance or erase the content baseline. */
    public void recordMetadata(UUID workspaceId, String fileId, String sourceUrl,
            DriveFileMetadata metadata, Instant observedAt) {
        if (observedAt == null) return;
        observedAt = normalizeObservedAt(observedAt);
        db.update("""
            UPDATE monitored_drive_files SET source_url=?,last_mime=?,last_modified_at=?,last_accessible=?
            WHERE workspace_id=? AND file_id=? AND (last_checked_at IS NULL OR last_checked_at <= ?)
            """, sourceUrl, metadata.mimeType(),
            metadata.modifiedTime() == null ? null : Timestamp.from(metadata.modifiedTime().toInstant()),
            metadata.canDownload(), workspaceId, fileId, Timestamp.from(observedAt));
    }

    /** PostgreSQL and H2 persist timestamps at microsecond precision. */
    static Instant normalizeObservedAt(Instant observedAt) {
        return observedAt.truncatedTo(ChronoUnit.MICROS);
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
