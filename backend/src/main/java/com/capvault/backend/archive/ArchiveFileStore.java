package com.capvault.backend.archive;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.capvault.backend.response.AcceptedPdfSnapshotService.Pdf;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ArchiveFileStore {
    public record File(UUID id, UUID archiveId, String fieldKey, String label, String sourceUrl,
        String sourceFileId, String resourceKey, String md5, long size, String modifiedTime,
        String providerId, String objectId, String sha256, String filename, String status,
        String error, Instant capturedAt, UUID leaseToken) {
        boolean stored() { return "STORED".equals(status); }
        String captureKey() { return id.toString(); }
    }
    private final JdbcTemplate db;
    private final Clock clock;
    public ArchiveFileStore(JdbcTemplate db, Clock clock) { this.db = db; this.clock = clock; }

    public List<File> files(UUID archiveId) {
        return db.query("SELECT * FROM archive_files WHERE archive_id=? ORDER BY label,field_key", ArchiveFileStore::row, archiveId);
    }
    public File get(UUID id) {
        return db.query("SELECT * FROM archive_files WHERE id=?", ArchiveFileStore::row,id).stream().findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Archived file not found."));
    }
    public void add(UUID archiveId, Pdf pdf, String providerId) {
        db.update("""
            INSERT INTO archive_files(id,archive_id,field_key,label,source_url,source_file_id,resource_key,
                expected_md5,expected_size,source_modified_time,provider_id,status)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,'QUEUED')
            """, UUID.randomUUID(), archiveId, pdf.fieldKey(), pdf.label(), pdf.sourceUrl(), pdf.fileId(),
            pdf.resourceKey(), pdf.md5(), pdf.size(), pdf.modifiedTime(), providerId);
    }
    public File claim() {
        Instant now = clock.instant();
        var ids = db.query("""
            SELECT id FROM archive_files WHERE status='QUEUED' OR (status='COPYING' AND lease_until < ?)
            ORDER BY id FETCH FIRST 20 ROWS ONLY
            """, (rs,n) -> rs.getObject(1,UUID.class), Timestamp.from(now));
        for (UUID id : ids) {
            UUID token=UUID.randomUUID();
            int updated=db.update("""
                UPDATE archive_files SET status='COPYING',lease_token=?,lease_until=?,error=NULL
                WHERE id=? AND (status='QUEUED' OR (status='COPYING' AND lease_until < ?))
                """, token,Timestamp.from(now.plusSeconds(600)),id,Timestamp.from(now));
            if (updated==1) return db.queryForObject("SELECT * FROM archive_files WHERE id=?", ArchiveFileStore::row,id);
        }
        return null;
    }
    public boolean reserve(File file, String objectId) {
        return db.update("UPDATE archive_files SET object_id=? WHERE id=? AND lease_token=? AND status='COPYING'",
            objectId,file.id(),file.leaseToken())==1;
    }
    public boolean identify(File file, String sha256, String filename) {
        return db.update("UPDATE archive_files SET sha256=?,filename=? WHERE id=? AND lease_token=? AND status='COPYING'",
            sha256,filename,file.id(),file.leaseToken())==1;
    }
    public boolean finish(File file, String error) {
        return db.update("""
            UPDATE archive_files SET status=?,error=?,captured_at=?,lease_token=NULL,lease_until=NULL
            WHERE id=? AND lease_token=? AND status='COPYING'
            """,error==null?"STORED":"FAILED",error,error==null?Timestamp.from(clock.instant()):null,
            file.id(),file.leaseToken())==1;
    }
    public void retry(UUID archiveId) {
        db.update("UPDATE archive_files SET status='QUEUED',error=NULL WHERE archive_id=? AND status='FAILED'",archiveId);
    }
    public List<ArchiveRecordResponse.History> history(UUID archiveId) {
        return db.query("""
            SELECT action,occurred_at,actor_subject FROM domain_audit_events
            WHERE target_id=? AND action LIKE 'ARCHIVE_%' ORDER BY occurred_at,id
            """,(rs,n)->new ArchiveRecordResponse.History(rs.getString(1),rs.getTimestamp(2).toInstant(),rs.getString(3)),archiveId);
    }
    private static File row(ResultSet rs,int ignored) throws SQLException {
        Timestamp at=rs.getTimestamp("captured_at");
        return new File(rs.getObject("id",UUID.class),rs.getObject("archive_id",UUID.class),
            rs.getString("field_key"),rs.getString("label"),rs.getString("source_url"),rs.getString("source_file_id"),
            rs.getString("resource_key"),rs.getString("expected_md5"),rs.getLong("expected_size"),
            rs.getString("source_modified_time"),rs.getString("provider_id"),rs.getString("object_id"),
            rs.getString("sha256"),rs.getString("filename"),rs.getString("status"),rs.getString("error"),
            at==null?null:at.toInstant(),rs.getObject("lease_token",UUID.class));
    }
}
