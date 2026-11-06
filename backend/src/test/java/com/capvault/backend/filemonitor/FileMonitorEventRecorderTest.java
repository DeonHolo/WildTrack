package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.assertThat;
import com.capvault.backend.drive.DriveFileMetadata;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FileMonitorEventRecorderTest {
    @Autowired JdbcTemplate db;
    @Autowired FileMonitorEventRecorder recorder;

    @Test
    void changedBytesUseSuppliedObservedAtAndCreateOneEvent() {
        UUID workspace = UUID.randomUUID();
        Instant before = Instant.parse("2026-10-18T01:00:00Z");
        Instant observed = Instant.parse("2026-10-18T02:00:00Z");
        seed(workspace, "file-a", "old", before);
        recorder.recordVerifiedContentChange(workspace, "file-a", "drive:file-a", metadata("file-a", "new"), observed);
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", String.class, workspace, "file-a")).isEqualTo("new");
        assertThat(db.queryForObject("SELECT last_checked_at FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", java.sql.Timestamp.class, workspace, "file-a").toInstant()).isEqualTo(observed);
        assertThat(db.queryForObject("SELECT observed_at FROM monitored_drive_events WHERE workspace_id=? AND file_id=?", java.sql.Timestamp.class, workspace, "file-a").toInstant()).isEqualTo(observed);
    }

    @Test
    void sameBytesAdvanceWatermarkWithoutCreatingEvent() {
        UUID workspace = UUID.randomUUID();
        Instant before = Instant.parse("2026-10-18T01:00:00Z");
        seed(workspace, "file-b", "same", before);
        recorder.recordVerifiedContentChange(workspace, "file-b", "drive:file-b", metadata("file-b", "same"), before.plusSeconds(3600));
        assertThat(db.queryForObject("SELECT last_checked_at FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", java.sql.Timestamp.class, workspace, "file-b").toInstant()).isEqualTo(before.plusSeconds(3600));
        assertThat(countEvents(workspace, "file-b")).isZero();
    }

    @Test
    void olderObservationCannotOverwriteNewerBaseline() {
        UUID workspace = UUID.randomUUID();
        Instant newer = Instant.parse("2026-10-18T03:00:00Z");
        seed(workspace, "file-c", "newer", newer);
        recorder.recordVerifiedContentChange(workspace, "file-c", "drive:file-c", metadata("file-c", "older"), newer.minusSeconds(60));
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", String.class, workspace, "file-c")).isEqualTo("newer");
        assertThat(countEvents(workspace, "file-c")).isZero();
    }

    @Test
    void subMicrosecondOrderingUsesDatabasePrecision() {
        UUID workspace = UUID.randomUUID();
        Instant newer = Instant.parse("2026-10-18T03:00:00.123456400Z");
        Instant older = Instant.parse("2026-10-18T03:00:00.123456100Z");
        recorder.recordVerifiedContentChange(workspace, "micro", "drive:micro", metadata("micro", "new"), newer);
        recorder.recordVerifiedContentChange(workspace, "micro", "drive:micro", metadata("micro", "old"), older);
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", String.class, workspace, "micro"))
            .isEqualTo("new");
        assertThat(db.queryForObject("SELECT last_checked_at FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", java.sql.Timestamp.class, workspace, "micro").toInstant())
            .isEqualTo(Instant.parse("2026-10-18T03:00:00.123456Z"));
    }

    @Test
    void delayedDifferentBytesCannotUndoNewerSameByteWatermark() {
        UUID workspace = UUID.randomUUID();
        Instant first = Instant.parse("2026-10-18T01:00:00Z");
        seed(workspace, "file-watermark", "old", first);
        recorder.recordVerifiedContentChange(workspace, "file-watermark", "drive:file-watermark", metadata("file-watermark", "new"), first.plusSeconds(60));
        recorder.recordVerifiedContentChange(workspace, "file-watermark", "drive:file-watermark", metadata("file-watermark", "new"), first.plusSeconds(120));
        recorder.recordVerifiedContentChange(workspace, "file-watermark", "drive:file-watermark", metadata("file-watermark", "late"), first.plusSeconds(90));
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", String.class, workspace, "file-watermark")).isEqualTo("new");
        assertThat(db.queryForObject("SELECT last_checked_at FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", java.sql.Timestamp.class, workspace, "file-watermark").toInstant()).isEqualTo(first.plusSeconds(120));
        assertThat(countEvents(workspace, "file-watermark")).isEqualTo(1);
    }

    @Test
    void unchangedRecheckRetainsAlertIdAndObservedAtBeforeNewVersion() {
        UUID workspace = UUID.randomUUID();
        Instant base = Instant.parse("2026-10-18T01:00:00Z");
        seed(workspace, "history", "old", base);
        recorder.recordVerifiedContentChange(workspace, "history", "drive:history", metadata("history", "new"), base.plusSeconds(60));
        UUID firstId = db.queryForObject("SELECT id FROM monitored_drive_events WHERE workspace_id=? AND file_id=?", UUID.class, workspace, "history");
        Instant firstObserved = db.queryForObject("SELECT observed_at FROM monitored_drive_events WHERE id=?", java.sql.Timestamp.class, firstId).toInstant();
        recorder.recordVerifiedContentChange(workspace, "history", "drive:history", metadata("history", "new"), base.plusSeconds(120));
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=? AND file_id=?", Integer.class, workspace, "history")).isEqualTo(1);
        assertThat(db.queryForObject("SELECT id FROM monitored_drive_events WHERE workspace_id=? AND file_id=?", UUID.class, workspace, "history")).isEqualTo(firstId);
        assertThat(db.queryForObject("SELECT observed_at FROM monitored_drive_events WHERE id=?", java.sql.Timestamp.class, firstId).toInstant()).isEqualTo(firstObserved);
        recorder.recordVerifiedContentChange(workspace, "history", "drive:history", metadata("history", "latest"), base.plusSeconds(180));
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=? AND file_id=?", Integer.class, workspace, "history")).isEqualTo(2);
    }

    @Test
    void firstBaselineAndMissingChecksumDoNotClaimChange() {
        UUID workspace = UUID.randomUUID();
        Instant observed = Instant.parse("2026-10-18T04:00:00Z");
        recorder.recordVerifiedContentChange(workspace, "file-d", "drive:file-d", new DriveFileMetadata("file-d", "d.pdf", "application/pdf", 10L, null, OffsetDateTime.parse("2026-10-18T03:59:00Z"), true, "drive:file-d"), observed);
        assertThat(countEvents(workspace, "file-d")).isZero();
        recorder.recordVerifiedContentChange(workspace, "file-e", "drive:file-e", metadata("file-e", "first"), observed);
        assertThat(countEvents(workspace, "file-e")).isZero();
    }

    @Test
    void repeatedSharedFileObservationCreatesOneEvent() {
        UUID workspace = UUID.randomUUID();
        Instant before = Instant.parse("2026-10-18T01:00:00Z");
        seed(workspace, "shared", "old", before);
        recorder.recordVerifiedContentChange(workspace, "shared", "drive:shared", metadata("shared", "new"), before.plusSeconds(60));
        recorder.recordVerifiedContentChange(workspace, "shared", "drive:shared", metadata("shared", "new"), before.plusSeconds(120));
        assertThat(countEvents(workspace, "shared")).isEqualTo(1);
    }

    @Test
    void concurrentFirstBaselineInsertionLeavesOneSharedBaseline() throws Exception {
        UUID workspace = UUID.randomUUID();
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var first = pool.submit(() -> recordAfter(start, workspace, "first"));
            var second = pool.submit(() -> recordAfter(start, workspace, "first"));
            start.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", Integer.class, workspace, "race")).isEqualTo(1);
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=? AND file_id=?", String.class, workspace, "race")).isEqualTo("first");
        assertThat(countEvents(workspace, "race")).isZero();
    }

    private void recordAfter(CountDownLatch start, UUID workspace, String checksum) {
        try {
            start.await(10, TimeUnit.SECONDS);
            recorder.recordVerifiedContentChange(workspace, "race", "drive:race", metadata("race", checksum), Instant.parse("2026-10-18T05:00:00Z"));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(interrupted);
        }
    }

    private void seed(UUID workspace, String fileId, String checksum, Instant checked) {
        db.update("INSERT INTO monitored_drive_files(workspace_id,file_id,source_url,last_checksum,last_checked_at,next_check_at) VALUES(?,?,?,?,?,?)", workspace, fileId, "drive:" + fileId, checksum, java.sql.Timestamp.from(checked), java.sql.Timestamp.from(checked));
    }
    private int countEvents(UUID workspace, String fileId) {
        return db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=? AND file_id=?", Integer.class, workspace, fileId);
    }
    private static DriveFileMetadata metadata(String fileId, String checksum) {
        return new DriveFileMetadata(fileId, fileId + ".pdf", "application/pdf", 10L, checksum, OffsetDateTime.parse("2026-10-18T04:00:00Z"), true, "drive:" + fileId);
    }
}
