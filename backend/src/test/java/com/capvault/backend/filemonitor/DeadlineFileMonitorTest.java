package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.drive.GoogleDriveUnavailableException;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.capvault.backend.filecheck.FileCheckRequest;
import com.capvault.backend.filecheck.FileCheckService;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.response.FormResponseService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/** Real H2 report persistence and parser, fictional team/Drive metadata; never touches live files. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DeadlineFileMonitorTest {
    @Autowired JdbcTemplate db;
    @Autowired FormResponseService submissions;
    @Autowired FormResponseRepository responses;
    @Autowired DeliverableRepository deliverables;
    @Autowired DeliverableFieldRepository fields;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentRecordRepository students;
    @Autowired FileCheckReportRepository reports;
    @Autowired FileCheckService checker;
    @Autowired ObjectMapper json;
    @MockBean GoogleDriveGateway drive;

    @Test
    void deadlineIntervalsAreDerivedFromRealDeliverableDeadline() {
        Instant deadline = Instant.parse("2026-09-25T15:59:00Z");
        assertThat(DeadlineFileMonitor.interval(deadline, deadline.minus(Duration.ofHours(25))))
            .isEqualTo(Duration.ofHours(1));
        assertThat(DeadlineFileMonitor.interval(deadline, deadline.minus(Duration.ofHours(23))))
            .isEqualTo(Duration.ofMinutes(5));
        assertThat(DeadlineFileMonitor.interval(deadline, deadline.plus(Duration.ofHours(47))))
            .isEqualTo(Duration.ofMinutes(5));
        assertThat(DeadlineFileMonitor.interval(deadline, deadline.plus(Duration.ofHours(49))))
            .isEqualTo(Duration.ofHours(1));
    }

    @Test
    void threeHundredFictionalStudentsOnSixtySharedPdfsAreRateLimitedPerUniqueFile() {
        AcademicWorkspace workspace = workspaces.save(new AcademicWorkspace(
            "Fictional sixty-team load", "IT", "MONITOR-LOAD", "Semester 1", "2099-2100", true));
        Deliverable deliverable = deliverables.save(new Deliverable(workspace.getId(), "SRS",
            "Refactored SRS", "monitor-load", "Synthetic workload only",
            LocalDateTime.now(ZoneId.of("Asia/Manila")).plusHours(12),
            true, DeliverableStatus.PUBLISHED));
        fields.save(new DeliverableField(UUID.randomUUID().toString(),
            deliverable.getId(), "documentPdf", "PDF Drive Link", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.MANUAL, false, true));
        for (int i = 0; i < 300; i++) {
            String url = "https://drive.google.com/file/d/synthetic-team-file-" + i / 5 + "/view";
            responses.save(new com.capvault.backend.response.FormResponse(
                UUID.randomUUID(), workspace.getId(), deliverable.getId(),
                "synthetic-subject-" + i, "fake" + i + "@example.invalid", UUID.randomUUID(),
                "synthetic-number-" + i, "Fictional student", "team-" + i / 5,
                "{\"documentPdf\":\"" + url + "\"}", Instant.now(), Instant.now()));
        }
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenAnswer(call -> {
            DriveFileReference ref = call.getArgument(0);
            return new DriveFileMetadata(ref.fileId(), "fictional.pdf", "application/pdf",
                100L, "synthetic-initial-checksum", OffsetDateTime.now(), true,
                "https://drive.google.com/file/d/" + ref.fileId() + "/view");
        });
        var monitor = new DeadlineFileMonitor(db, responses, deliverables, fields,
            workspaces, reports, drive, checker, json, true, workspace.getId().toString(), 20);
        for (int i = 0; i < 3; i++) {
            var cycle = monitor.scanOnce();
            assertThat(cycle.eligibleUniqueFiles()).isEqualTo(60);
            assertThat(cycle.metadataRequests()).isEqualTo(20);
            assertThat(cycle.fullDownloads()).isZero();
        }
        assertThat(monitor.scanOnce().metadataRequests()).isZero();
        verify(drive, times(60)).getMetadata(any(DriveFileReference.class));
        verify(drive, never()).download(any(DriveFileReference.class));
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_files WHERE workspace_id=?",
            Integer.class, workspace.getId())).isEqualTo(60);
    }

    @Test
    void fiveStudentResponsesSharingOneFileUseOneMetadataRequestAndOnePdfDownload() throws Exception {
        AcademicWorkspace workspace = workspaces.save(new AcademicWorkspace(
            "Fictional isolated file monitoring", "IT", "MONITOR", "Semester 1", "2099-2100", true));
        LocalDateTime due = LocalDateTime.now(ZoneId.of("Asia/Manila")).plusHours(12);
        Deliverable deliverable = deliverables.save(new Deliverable(workspace.getId(), "SRS",
            "Refactored SRS", "monitor-fake-srs", "Only fictional synthetic PDF", due,
            true, DeliverableStatus.PUBLISHED));
        DeliverableField pdf = fields.save(new DeliverableField(UUID.randomUUID().toString(),
            deliverable.getId(), "documentPdf", "PDF Drive Link", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.MANUAL, false, true));
        String link = "https://drive.google.com/file/d/fictional-team-shared-pdf/view";
        UUID firstResponseId = null;
        for (int i = 0; i < 5; i++) {
            String number = "99-9" + i + "99-999";
            students.save(new StudentRecord(workspace.getId(), number, "Fictional Student " + i,
                "synthetic-team-one", "1", "SYNTH", "Fictional Adviser", null, i + 1));
            var result = submissions.submit(new FormResponseService.SubmitCommand(
                workspace.getId(), deliverable.getId(), "synthetic-monitor-subject-" + i,
                "synthetic-" + i + "@example.invalid", number,
                Map.of("documentPdf", link), null));
            if (i == 0) firstResponseId = result.response().getId();
        }
        byte[] original = fictionalPdf("A");
        byte[] changed = fictionalPdf("B");
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenReturn(
            metadata(link, original, "2026-09-21T00:00:00Z"),
            metadata(link, changed, "2026-09-22T00:00:00Z"),
            metadata(link, changed, "2026-09-22T00:00:00Z"));
        when(drive.download(any(DriveFileReference.class))).thenReturn(original, changed);

        // Capture a genuine baseline only from an actual earlier Document Check.
        var response = responses.findById(firstResponseId).orElseThrow();
        var originalReport = checker.check(workspace.getId(), new FileCheckRequest(
            firstResponseId.toString(), pdf.getId(), "SRS", link, response.getUpdatedAt().toString()));
        assertThat(originalReport.metadata().md5Checksum()).isEqualTo(md5(original));
        clearInvocations(drive);

        var monitor = new DeadlineFileMonitor(db, responses, deliverables, fields,
            workspaces, reports, drive, checker, json, true, workspace.getId().toString(), 20);
        var changedCycle = monitor.scanOnce();
        assertThat(changedCycle.eligibleUniqueFiles()).isEqualTo(1);
        assertThat(changedCycle.metadataRequests()).isEqualTo(1);
        assertThat(changedCycle.fullDownloads()).isEqualTo(1);
        assertThat(changedCycle.reportsUpdated()).isEqualTo(5);
        verify(drive, times(1)).getMetadata(any(DriveFileReference.class));
        verify(drive, times(1)).download(any(DriveFileReference.class));
        assertThat(db.queryForObject("""
            SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=? AND kind='CONTENT_CHANGED'
            """, Integer.class, workspace.getId())).isEqualTo(1);
        for (var each : responses.findAllByWorkspaceId(workspace.getId())) {
            var checked = reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
                workspace.getId(), each.getId().toString(), pdf.getId()).orElseThrow();
            assertThat(json.readTree(checked.getReportJson()).path("metadata")
                .path("md5Checksum").asText()).isEqualTo(md5(changed));
        }
        clearInvocations(drive);
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        var unchangedCycle = monitor.scanOnce();
        assertThat(unchangedCycle.metadataRequests()).isEqualTo(1);
        assertThat(unchangedCycle.fullDownloads()).isZero();
        assertThat(unchangedCycle.reportsUpdated()).isZero();
        verify(drive, times(1)).getMetadata(any(DriveFileReference.class));
        verify(drive, never()).download(any(DriveFileReference.class));

        // A later metadata timestamp with exactly the same checksum is informational
        // only: never call the PDF parser, invent content edits, or count lateness.
        clearInvocations(drive);
        when(drive.getMetadata(any(DriveFileReference.class)))
            .thenReturn(metadata(link, changed, "2026-09-22T01:00:00Z"));
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        var metadataOnly = monitor.scanOnce();
        assertThat(metadataOnly.fullDownloads()).isZero();
        assertThat(metadataOnly.reportsUpdated()).isZero();
        assertThat(db.queryForObject("""
            SELECT COUNT(*) FROM monitored_drive_events
            WHERE workspace_id=? AND kind='METADATA_CHANGED'
            """, Integer.class, workspace.getId())).isEqualTo(1);

        // Missing provider checksums must not silently suppress a possible
        // same-link edit. Reinspect once, but never assert a verified change.
        reset(drive);
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenReturn(
            new DriveFileMetadata("fictional-team-shared-pdf", "synthetic-srs.pdf",
                "application/pdf", (long) changed.length, null,
                OffsetDateTime.parse("2026-09-22T02:00:00Z"), true, link));
        when(drive.download(any(DriveFileReference.class))).thenReturn(changed);
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        var withoutChecksum = monitor.scanOnce();
        assertThat(withoutChecksum.fullDownloads()).isEqualTo(1);
        assertThat(withoutChecksum.reportsUpdated()).isEqualTo(5);
        assertThat(db.queryForObject("""
            SELECT COUNT(*) FROM monitored_drive_events
            WHERE workspace_id=? AND kind='CHANGE_AWAITING_CHECK'
            """, Integer.class, workspace.getId())).isEqualTo(1);
        assertThat(db.queryForObject("""
            SELECT COUNT(*) FROM monitored_drive_events
            WHERE workspace_id=? AND kind='CONTENT_CHANGED'
            """, Integer.class, workspace.getId())).isEqualTo(1);

        // Losing link access produces one actual per-response BLOCKED report plus
        // one unique file event. Repeated failures do not flood the database.
        reset(drive);
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class)))
            .thenThrow(new GoogleDriveUnavailableException(
                "The Drive file is inaccessible. Check sharing permissions."));
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        var denied = monitor.scanOnce();
        assertThat(denied.metadataRequests()).isEqualTo(1);
        assertThat(denied.fullDownloads()).isZero();
        assertThat(denied.reportsUpdated()).isEqualTo(5);
        assertThat(db.queryForObject("""
            SELECT COUNT(*) FROM monitored_drive_events
            WHERE workspace_id=? AND kind='ACCESS_UNAVAILABLE'
            """, Integer.class, workspace.getId())).isEqualTo(1);

        for (var each : responses.findAllByWorkspaceId(workspace.getId())) {
            var blocked = reports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
                workspace.getId(), each.getId().toString(), pdf.getId()).orElseThrow();
            assertThat(json.readTree(blocked.getReportJson()).path("flags").toString())
                .contains("Inaccessible");
        }
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        assertThat(monitor.scanOnce().reportsUpdated()).isZero();
        assertThat(db.queryForObject("""
            SELECT COUNT(*) FROM monitored_drive_events
            WHERE workspace_id=? AND kind='ACCESS_UNAVAILABLE'
            """, Integer.class, workspace.getId())).isEqualTo(1);

        // A transient provider failure after confirmed denial cannot invent
        // a successful restore or change the last-known access observation.
        reset(drive);
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class)))
            .thenThrow(new IllegalStateException("Temporary provider timeout"));
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        assertThat(monitor.scanOnce().reportsUpdated()).isZero();
        assertThat(db.queryForObject("""
            SELECT last_accessible FROM monitored_drive_files WHERE workspace_id=?
            """, Boolean.class, workspace.getId())).isFalse();

        // The wrong file identity must never produce a new report or event.
        reset(drive);
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenReturn(
            new DriveFileMetadata("unrelated-private-file", "wrong.pdf", "application/pdf",
                (long) changed.length, md5(changed),
                OffsetDateTime.parse("2026-09-22T03:00:00Z"), true, link));
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        assertThat(monitor.scanOnce().reportsUpdated()).isZero();
        assertThat(db.queryForObject("""
            SELECT last_accessible FROM monitored_drive_files WHERE workspace_id=?
            """, Boolean.class, workspace.getId())).isFalse();
        verify(drive, never()).download(any(DriveFileReference.class));
    }

    private static DriveFileMetadata metadata(String link, byte[] pdf, String modifiedAt) throws Exception {
        return new DriveFileMetadata("fictional-team-shared-pdf", "synthetic-srs.pdf", "application/pdf",
            (long) pdf.length, md5(pdf), OffsetDateTime.parse(modifiedAt), true, link);
    }

    private static String md5(byte[] pdf) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(pdf));
    }

    private static byte[] fictionalPdf(String label) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(72, 700);
                content.showText("Fictional monitoring PDF " + label + ", no student data.");
                content.endText();
            }
            doc.save(output);
            return output.toByteArray();
        }
    }
}
