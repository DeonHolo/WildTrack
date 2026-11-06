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
        workspaces.flush();
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = TRUE WHERE id = ?", workspace.getId());
        var monitor = new DeadlineFileMonitor(db, responses, deliverables, fields,
            workspaces, reports, drive, checker, json, 20);
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = FALSE WHERE id = ?", workspace.getId());
        assertThat(monitor.scanOnce(workspace.getId()).metadataRequests()).isZero();
        monitor.scheduledCycle();
        verify(drive, never()).getMetadata(any(DriveFileReference.class));
        workspaces.flush();
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = TRUE WHERE id = ?", workspace.getId());
        for (int i = 0; i < 3; i++) {
            var cycle = monitor.scanOnce(workspace.getId());
            assertThat(cycle.eligibleUniqueFiles()).isEqualTo(60);
            assertThat(cycle.metadataRequests()).isEqualTo(20);
            assertThat(cycle.fullDownloads()).isZero();
        }
        assertThat(monitor.scanOnce(workspace.getId()).metadataRequests()).isZero();
        verify(drive, times(60)).getMetadata(any(DriveFileReference.class));
        // A configured empty deliverable set means no scans even with monitoring
        // enabled and previously checked files due for another observation.
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = TRUE, file_monitor_selection_configured = TRUE WHERE id = ?",
            workspace.getId());
        assertThat(monitor.scanOnce(workspace.getId()).eligibleUniqueFiles()).isZero();
        verify(drive, times(60)).getMetadata(any(DriveFileReference.class));
        db.update("INSERT INTO workspace_file_monitor_deliverables(workspace_id,deliverable_id) VALUES (?, ?)",
            workspace.getId(), deliverable.getId());
        assertThat(monitor.scanOnce(workspace.getId()).eligibleUniqueFiles()).isEqualTo(60);
        verify(drive, never()).download(any(DriveFileReference.class));
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_files WHERE workspace_id=?",
            Integer.class, workspace.getId())).isEqualTo(60);
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = FALSE WHERE id = ?", workspace.getId());
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        assertThat(monitor.scanOnce(workspace.getId()).metadataRequests()).isZero();
        verify(drive, times(60)).getMetadata(any(DriveFileReference.class));
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

        workspaces.flush();
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = TRUE WHERE id = ?", workspace.getId());
        var monitor = new DeadlineFileMonitor(db, responses, deliverables, fields,
            workspaces, reports, drive, checker, json, 20);
        var changedCycle = monitor.scanOnce(workspace.getId());
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
        var unchangedCycle = monitor.scanOnce(workspace.getId());
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
        var metadataOnly = monitor.scanOnce(workspace.getId());
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
        var withoutChecksum = monitor.scanOnce(workspace.getId());
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
                "The Drive file is inaccessible. Check sharing permissions.",
                GoogleDriveUnavailableException.Kind.FILE_ACCESS));
        db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
            java.sql.Timestamp.from(Instant.now().minusSeconds(1)), workspace.getId());
        var denied = monitor.scanOnce(workspace.getId());
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
        assertThat(monitor.scanOnce(workspace.getId()).reportsUpdated()).isZero();
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
        assertThat(monitor.scanOnce(workspace.getId()).reportsUpdated()).isZero();
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
        assertThat(monitor.scanOnce(workspace.getId()).reportsUpdated()).isZero();
        assertThat(db.queryForObject("""
            SELECT last_accessible FROM monitored_drive_files WHERE workspace_id=?
            """, Boolean.class, workspace.getId())).isFalse();
        verify(drive, never()).download(any(DriveFileReference.class));
    }

    @Test
    void aSlowScheduledCaptureCannotReplaceANewerManualObservation() throws Exception {
        AcademicWorkspace workspace = workspaces.save(new AcademicWorkspace(
            "Fictional overlapping checks", "IT", "MONITOR-RACE", "Semester 1", "2099-2100", true));
        Deliverable deliverable = deliverables.save(new Deliverable(workspace.getId(), "SRS",
            "Refactored SRS", "monitor-race", "Synthetic overlap only",
            LocalDateTime.now(ZoneId.of("Asia/Manila")).plusHours(12), true, DeliverableStatus.PUBLISHED));
        DeliverableField pdf = fields.save(new DeliverableField(UUID.randomUUID().toString(),
            deliverable.getId(), "documentPdf", "PDF Drive Link", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.MANUAL, false, true));
        String link = "https://drive.google.com/file/d/fictional-team-shared-pdf/view";
        students.save(new StudentRecord(workspace.getId(), "99-9000-001", "Fictional overlap student",
            "synthetic-race-team", "1", "SYNTH", "Fictional Adviser", null, 1));
        var response = submissions.submit(new FormResponseService.SubmitCommand(workspace.getId(),
            deliverable.getId(), "synthetic-race-subject", "race@example.invalid", "99-9000-001",
            Map.of("documentPdf", link), null)).response();
        var request = new FileCheckRequest(response.getId().toString(), pdf.getId(), "SRS", link,
            response.getUpdatedAt().toString());
        byte[] original = fictionalPdf("A");
        byte[] delayed = fictionalPdf("B");
        byte[] newest = fictionalPdf("C");
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class)))
            .thenReturn(metadata(link, original, "2026-10-15T00:00:00Z"));
        when(drive.download(any(DriveFileReference.class))).thenReturn(original);
        checker.check(workspace.getId(), request);
        workspaces.flush();
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = TRUE WHERE id = ?", workspace.getId());
        when(drive.getMetadata(any(DriveFileReference.class))).thenReturn(
            metadata(link, delayed, "2026-10-16T00:00:00Z"),
            metadata(link, newest, "2026-10-17T00:00:00Z"));
        var manualFinished = new java.util.concurrent.atomic.AtomicBoolean();
        when(drive.download(any(DriveFileReference.class))).thenAnswer(call -> {
            if (manualFinished.compareAndSet(false, true)) {
                // A real manual request finishes while the older scheduled download is in flight.
                assertThat(checker.check(workspace.getId(), request).metadata().md5Checksum())
                    .isEqualTo(md5(newest));
                return delayed;
            }
            return newest;
        });
        clearInvocations(drive);
        var monitor = new DeadlineFileMonitor(db, responses, deliverables, fields,
            workspaces, reports, drive, checker, json, 20);

        assertThat(monitor.scanOnce(workspace.getId()).reportsUpdated()).isZero();
        assertThat(manualFinished).isTrue();
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=?",
            String.class, workspace.getId())).isEqualTo(md5(newest));
        assertThat(db.queryForList("SELECT current_checksum FROM monitored_drive_events WHERE workspace_id=? AND kind='CONTENT_CHANGED'",
            String.class, workspace.getId())).containsExactly(md5(newest));
        assertThat(checker.findLatest(workspace.getId(), response.getId().toString(), pdf.getId())
            .orElseThrow().metadata().md5Checksum()).isEqualTo(md5(newest));
        verify(drive, times(2)).getMetadata(any(DriveFileReference.class));
        verify(drive, times(2)).download(any(DriveFileReference.class));
    }

    @Test
    void lateAccessDenialCannotPublishAfterANewerManualSuccess() throws Exception {
        var fixture = raceFixture("DENIAL");
        byte[] newest = fictionalPdf("Newest manual bytes");
        var first = new java.util.concurrent.atomic.AtomicBoolean(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenAnswer(call -> {
            if (first.compareAndSet(true, false)) {
                assertThat(checker.check(fixture.workspace(), fixture.request()).status()).isEqualTo("COMPLETED");
                throw new GoogleDriveUnavailableException("Synthetic delayed denial", GoogleDriveUnavailableException.Kind.FILE_ACCESS);
            }
            return metadata(fixture.url(), newest, "2026-10-19T00:00:00Z");
        });
        when(drive.download(any(DriveFileReference.class))).thenReturn(newest);
        var result = monitor().scanOnce(fixture.workspace());
        assertThat(result.reportsUpdated()).isZero();
        assertThat(db.queryForObject("SELECT last_accessible FROM monitored_drive_files WHERE workspace_id=?",
            Boolean.class, fixture.workspace())).isTrue();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=? AND kind='ACCESS_UNAVAILABLE'",
            Integer.class, fixture.workspace())).isZero();
        assertThat(checker.findLatest(fixture.workspace(), fixture.request().responseId(), fixture.request().fieldId())
            .orElseThrow().metadata().md5Checksum()).isEqualTo(md5(newest));
    }

    @Test
    void workerWhoseLeaseWasReclaimedCannotPublishReportsEventsOrScheduling() throws Exception {
        var fixture = raceFixture("LEASE");
        byte[] older = fictionalPdf("Delayed old bytes");
        byte[] newest = fictionalPdf("Winning new bytes");
        var first = new java.util.concurrent.atomic.AtomicBoolean(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenAnswer(call -> {
            if (first.compareAndSet(true, false)) {
                // A's provider read spans an expired lease. An independent worker
                // B acquires a new token and fully publishes before A returns.
                db.update("UPDATE monitored_drive_files SET next_check_at=? WHERE workspace_id=?",
                    java.sql.Timestamp.from(Instant.now().minusSeconds(1)), fixture.workspace());
                assertThat(monitor().scanOnce(fixture.workspace()).reportsUpdated()).isEqualTo(1);
                return metadata(fixture.url(), older, "2026-10-18T00:00:00Z");
            }
            return metadata(fixture.url(), newest, "2026-10-19T00:00:00Z");
        });
        when(drive.download(any(DriveFileReference.class))).thenReturn(newest, older);
        assertThat(monitor().scanOnce(fixture.workspace()).reportsUpdated()).isZero();
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=?",
            String.class, fixture.workspace())).isEqualTo(md5(newest));
        assertThat(db.queryForList("SELECT current_checksum FROM monitored_drive_events WHERE workspace_id=? AND kind='CONTENT_CHANGED'",
            String.class, fixture.workspace())).containsExactly(md5(newest));
        assertThat(checker.findLatest(fixture.workspace(), fixture.request().responseId(), fixture.request().fieldId())
            .orElseThrow().metadata().md5Checksum()).isEqualTo(md5(newest));
    }

    @Test
    void responseRetiredDuringDownloadCannotReceiveReportOrPublishChangeEvent() throws Exception {
        var fixture = raceFixture("DEMOTION");
        String original = checker.findLatest(fixture.workspace(), fixture.request().responseId(), fixture.request().fieldId())
            .orElseThrow().metadata().md5Checksum();
        byte[] changed = fictionalPdf("Retired while downloading");
        when(drive.getMetadata(any(DriveFileReference.class)))
            .thenReturn(metadata(fixture.url(), changed, "2026-10-20T00:00:00Z"));
        when(drive.download(any(DriveFileReference.class))).thenAnswer(call -> {
            UUID responseId = UUID.fromString(fixture.request().responseId());
            db.update("UPDATE form_responses SET current_student_key=NULL WHERE id=?", responseId);
            assertThat(responses.findById(responseId).orElseThrow().isCurrentResponse()).isTrue();
            return changed;
        });

        assertThat(monitor().scanOnce(fixture.workspace()).reportsUpdated()).isZero();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=? AND kind='CONTENT_CHANGED'",
            Integer.class, fixture.workspace())).isZero();
        assertThat(checker.findLatest(fixture.workspace(), fixture.request().responseId(), fixture.request().fieldId())
            .orElseThrow().metadata().md5Checksum()).isEqualTo(original);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void retiredResponseCannotPublishFromACachedManualCheck(boolean legacy) throws Exception {
        var fixture = raceFixture("MANUAL-" + legacy);
        String original = db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=?",
            String.class, fixture.workspace());
        byte[] changed = fictionalPdf("Manual bytes after response retirement");
        when(drive.getMetadata(any(DriveFileReference.class)))
            .thenReturn(metadata(fixture.url(), changed, "2026-10-21T00:00:00Z"));
        when(drive.download(any(DriveFileReference.class))).thenAnswer(call -> {
            UUID responseId = UUID.fromString(fixture.request().responseId());
            db.update("UPDATE form_responses SET current_student_key=NULL WHERE id=?", responseId);
            // Models another transaction retiring the row while this request's entity is cached.
            assertThat(responses.findById(responseId).orElseThrow().isCurrentResponse()).isTrue();
            return changed;
        });
        FileCheckRequest request = legacy ? new FileCheckRequest(fixture.request().responseId(), "SRS", fixture.url(),
            fixture.request().sourceResponseUpdatedAt()) : fixture.request();
        checker.check(fixture.workspace(), request);
        assertThat(db.queryForObject("SELECT last_checksum FROM monitored_drive_files WHERE workspace_id=?",
            String.class, fixture.workspace())).isEqualTo(original);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM monitored_drive_events WHERE workspace_id=? AND kind='CONTENT_CHANGED'",
            Integer.class, fixture.workspace())).isZero();
    }

    private DeadlineFileMonitor monitor() {
        return new DeadlineFileMonitor(db, responses, deliverables, fields, workspaces, reports, drive, checker, json, 20);
    }

    private record RaceFixture(UUID workspace, String url, FileCheckRequest request) { }

    private RaceFixture raceFixture(String code) throws Exception {
        var workspace = workspaces.save(new AcademicWorkspace("Synthetic race", "IT", "RACE-"+code,
            "Semester 1", "2099-2100", true));
        var deliverable = deliverables.save(new Deliverable(workspace.getId(), "SRS", "Synthetic SRS", "race-"+code,
            "Test only", LocalDateTime.now(ZoneId.of("Asia/Manila")).plusHours(12), true, DeliverableStatus.PUBLISHED));
        var field = fields.save(new DeliverableField(UUID.randomUUID().toString(), deliverable.getId(), "documentPdf",
            "PDF", DeliverableFieldType.DRIVE_PDF, true, 0, DocumentCheckPolicy.MANUAL, false, true));
        students.save(new StudentRecord(workspace.getId(), "99-9000-"+code, "Synthetic student", "race-team", "1", "TEST", "Adviser", null, 1));
        String url = "https://drive.google.com/file/d/fictional-team-shared-pdf/view";
        var response = submissions.submit(new FormResponseService.SubmitCommand(workspace.getId(), deliverable.getId(),
            "subject-"+code, "fake@example.invalid", "99-9000-"+code, Map.of("documentPdf", url), null)).response();
        var request = new FileCheckRequest(response.getId().toString(), field.getId(), "SRS", url, response.getUpdatedAt().toString());
        byte[] initial = fictionalPdf("Initial bytes");
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenReturn(metadata(url, initial, "2026-10-17T00:00:00Z"));
        when(drive.download(any(DriveFileReference.class))).thenReturn(initial);
        checker.check(workspace.getId(), request);
        workspaces.flush();
        db.update("UPDATE academic_workspaces SET file_monitor_enabled=TRUE WHERE id=?", workspace.getId());
        return new RaceFixture(workspace.getId(), url, request);
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
