package com.capvault.backend.filemonitor;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.capvault.backend.filecheck.FileCheckRequest;
import com.capvault.backend.filecheck.FileCheckResponse;
import com.capvault.backend.filecheck.FileCheckService;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Optional, per-workspace deadline-aware monitor. Polls unique submitted Drive file IDs,
 * never stores PDF bytes, and rechecks changed files using one download and PDF parse
 * per unique file. Each referencing response receives its own authorization-scoped report.
 *
 * Disabled unless the owner explicitly sets both WILDTRACK_FILE_MONITOR_ENABLED=true and
 * WILDTRACK_FILE_MONITOR_WORKSPACE_ID. A database compare-and-set lease prevents repeated
 * concurrent scans on multiple Heroku instances; a crashed job becomes eligible again.
 */
@Service
@EnableScheduling
public class DeadlineFileMonitor {
    private static final ZoneId MANILA = ZoneId.of("Asia/Manila");
    private final JdbcTemplate db;
    private final FormResponseRepository responses;
    private final DeliverableRepository deliverables;
    private final DeliverableFieldRepository fields;
    private final AcademicWorkspaceRepository workspaces;
    private final FileCheckReportRepository previousReports;
    private final GoogleDriveGateway drive;
    private final FileCheckService checks;
    private final ObjectMapper json;
    private final boolean enabled;
    private final String workspaceSetting;
    private final int batchLimit;

    public DeadlineFileMonitor(JdbcTemplate db, FormResponseRepository responses,
            DeliverableRepository deliverables, DeliverableFieldRepository fields,
            AcademicWorkspaceRepository workspaces, FileCheckReportRepository previousReports,
            GoogleDriveGateway drive, FileCheckService checks, ObjectMapper json,
            @Value("${wildtrack.file-monitor.enabled:false}") boolean enabled,
            @Value("${wildtrack.file-monitor.workspace-id:}") String workspaceSetting,
            @Value("${wildtrack.file-monitor.max-files-per-cycle:20}") int batchLimit) {
        this.db = db;
        this.responses = responses;
        this.deliverables = deliverables;
        this.fields = fields;
        this.workspaces = workspaces;
        this.previousReports = previousReports;
        this.drive = drive;
        this.checks = checks;
        this.json = json;
        this.enabled = enabled;
        this.workspaceSetting = workspaceSetting;
        this.batchLimit = Math.max(1, Math.min(batchLimit, 30));
    }

    record Target(FormResponse response, Deliverable deliverable, DeliverableField field, String url) { }
    record FileGroup(String fileId, String url, List<Target> targets, Instant nearestDeadline) { }
    public record Cycle(int eligibleUniqueFiles, int metadataRequests, int fullDownloads, int reportsUpdated) { }

    /** Scheduling is deliberately opt-in; opening Today's Work cannot trigger Drive requests. */
    @Scheduled(fixedDelayString = "${wildtrack.file-monitor.tick-ms:60000}")
    public synchronized void scheduledCycle() {
        if (!enabled || workspaceSetting.isBlank()) return;
        scanOnce();
    }

    public synchronized Cycle scanOnce() {
        if (!enabled || !drive.isConfigured() || workspaceSetting.isBlank()) return new Cycle(0, 0, 0, 0);
        UUID workspaceId;
        try {
            workspaceId = UUID.fromString(workspaceSetting);
        } catch (IllegalArgumentException badConfiguration) {
            throw new IllegalStateException("WILDTRACK_FILE_MONITOR_WORKSPACE_ID must be a valid workspace UUID.", badConfiguration);
        }
        if (workspaces.findById(workspaceId).filter(workspace -> workspace.isActive()).isEmpty()) {
            return new Cycle(0, 0, 0, 0);
        }
        Instant now = Instant.now();
        Map<String, FileGroup> unique = eligible(workspaceId, now);
        int requests = 0;
        int downloads = 0;
        int reports = 0;
        for (FileGroup file : unique.values().stream()
                .sorted(Comparator.comparing(FileGroup::nearestDeadline)).toList()) {
            if (requests >= batchLimit) break;
            seed(workspaceId, file, now);
            // Atomic claim: a concurrent dyno cannot check the same file until the
            // short lease expires. No network request is made while holding a DB lock.
            int claimed = db.update("""
                UPDATE monitored_drive_files SET next_check_at = ?
                WHERE workspace_id = ? AND file_id = ? AND next_check_at <= ?
                """, Timestamp.from(now.plusSeconds(180)), workspaceId, file.fileId(), Timestamp.from(now));
            if (claimed == 0) continue;
            requests++;
            try {
                var state = db.queryForMap("""
                    SELECT last_checksum, last_mime, last_modified_at, last_accessible, last_checked_at, failure_count
                    FROM monitored_drive_files WHERE workspace_id = ? AND file_id = ?
                    """, workspaceId, file.fileId());
                DriveFileMetadata metadata = drive.getMetadata(DriveLinkParser.parse(file.url()));
                // Never persist metadata or alert against a different Drive file if
                // a provider or gateway unexpectedly returns a mismatched identity.
                if (metadata == null || !file.fileId().equals(metadata.id())) {
                    throw new IllegalStateException("Drive returned metadata for an unexpected file identity.");
                }
                String previousHash = (String) state.get("last_checksum");
                boolean previouslyAccessible = Boolean.TRUE.equals(state.get("last_accessible"));
                String observedHash = normalized(metadata.md5Checksum());
                String previousMime = normalized((String) state.get("last_mime"));
                boolean downloadAllowed = metadata.canDownload();
                boolean contentChanged = previousHash != null && observedHash != null
                    && !previousHash.equalsIgnoreCase(observedHash);
                boolean accessChanged = !previouslyAccessible || !downloadAllowed;
                boolean typeChanged = previousMime != null
                    && !previousMime.equalsIgnoreCase(normalized(metadata.mimeType()));
                Object previousTimestamp = state.get("last_modified_at");
                Instant previousModified = previousTimestamp instanceof Timestamp ts ? ts.toInstant()
                    : previousTimestamp instanceof java.time.OffsetDateTime odt ? odt.toInstant() : null;
                boolean onlyMetadataChanged = previousHash != null && observedHash != null
                    && previousHash.equalsIgnoreCase(observedHash) && previousModified != null
                    && metadata.modifiedTime() != null
                    && !previousModified.equals(metadata.modifiedTime().toInstant());
                // Some provider responses omit MD5. In that situation a changed
                // modifiedTime warrants reinspection, but is NOT proof that the
                // PDF bytes changed. Do not announce a verified content change.
                boolean uncertainChange = (previousHash == null || observedHash == null)
                    && previousModified != null && metadata.modifiedTime() != null
                    && !previousModified.equals(metadata.modifiedTime().toInstant());
                if (!downloadAllowed && !Boolean.FALSE.equals(state.get("last_accessible"))) {
                    event(workspaceId, file.fileId(), "DOWNLOAD_UNAVAILABLE", previousHash,
                        observedHash, "The submitted file no longer permits downloading.", metadata);
                    for (Target target : file.targets()) {
                        try {
                            checks.checkCaptured(workspaceId, request(target),
                                new FileCheckService.CapturedPdf(metadata, null, null));
                            reports++;
                        } catch (IllegalArgumentException staleSubmission) {
                            // Do not record against a changed/retired response field.
                        }
                    }
                }
                if (contentChanged || typeChanged) {
                    String kind = contentChanged ? "CONTENT_CHANGED" : "FILE_TYPE_CHANGED";
                    if (downloadAllowed) {
                        FileCheckService.CapturedPdf capture;
                        try {
                            capture = checks.capture(DriveLinkParser.parse(file.url()), metadata);
                            for (Target target : file.targets()) {
                                try {
                                    checks.checkCaptured(workspaceId, request(target), capture);
                                    reports++;
                                } catch (IllegalArgumentException staleSubmission) {
                                    // A response/field may have changed while the monitor was checking.
                                }
                            }
                            event(workspaceId, file.fileId(), kind, previousHash, observedHash,
                                "The submitted file has a new verified content identity. Review its Document Check and history.", metadata);
                            if (capture.bytes() != null) downloads++;
                        } catch (RuntimeException downloadFailure) {
                            event(workspaceId, file.fileId(), "CHANGE_AWAITING_CHECK", previousHash,
                                observedHash, "A file change was detected, but the updated PDF could not be inspected.", metadata);
                            throw downloadFailure;
                        }
                    } else {
                        event(workspaceId, file.fileId(), "CHANGE_AWAITING_CHECK", previousHash,
                            observedHash, "A file change was detected, but downloading is not permitted.", metadata);
                    }
                } else if (accessChanged && downloadAllowed && state.get("last_accessible") != null) {
                    try {
                        var restored = checks.capture(DriveLinkParser.parse(file.url()), metadata);
                        if (restored.bytes() != null) downloads++;
                        for (Target target : file.targets()) {
                            try {
                                checks.checkCaptured(workspaceId, request(target), restored);
                                reports++;
                            } catch (IllegalArgumentException staleSubmission) { }
                        }
                    } catch (RuntimeException recheckUnavailable) {
                        event(workspaceId, file.fileId(), "CHANGE_AWAITING_CHECK", previousHash, observedHash,
                            "Access was restored but Document Check could not yet inspect the file.", metadata);
                        throw recheckUnavailable;
                    }
                    event(workspaceId, file.fileId(), "ACCESS_RESTORED", previousHash, observedHash,
                        "The submitted file is accessible again.", metadata);
                } else if (uncertainChange && downloadAllowed) {
                    // Do not silently skip an edit just because the provider did
                    // not supply a content checksum. The previous file identity
                    // cannot be reconstructed without retaining older PDF bytes.
                    var inspected = checks.capture(DriveLinkParser.parse(file.url()), metadata);
                    if (inspected.bytes() != null) downloads++;
                    for (Target target : file.targets()) {
                        try {
                            checks.checkCaptured(workspaceId, request(target), inspected);
                            reports++;
                        } catch (IllegalArgumentException staleSubmission) { }
                    }
                    event(workspaceId, file.fileId(), "CHANGE_AWAITING_CHECK", previousHash, observedHash,
                        "Drive metadata changed without comparable checksums. The current PDF was rechecked, but an earlier content change cannot be verified.", metadata);
                } else if (onlyMetadataChanged) {
                    event(workspaceId, file.fileId(), "METADATA_CHANGED", previousHash, observedHash,
                        "Drive metadata changed while the observed PDF content checksum stayed the same.", metadata);
                }
                // An absent checksum is UNKNOWN, not evidence that the PDF stayed unchanged.
                db.update("""
                    UPDATE monitored_drive_files SET source_url=?, last_checksum=?, last_mime=?,
                      last_modified_at=?, last_accessible=?, last_checked_at=?, next_check_at=?, failure_count=0
                    WHERE workspace_id=? AND file_id=?
                    """, file.url(), observedHash, metadata.mimeType(),
                    metadata.modifiedTime() == null ? null : Timestamp.from(metadata.modifiedTime().toInstant()), downloadAllowed,
                    Timestamp.from(now), Timestamp.from(now.plus(interval(file.nearestDeadline(), now))),
                    workspaceId, file.fileId());
            } catch (RuntimeException failure) {
                // Do not classify a temporary network error as deliberate student restriction.
                // Only confirmed access denial is reported as an access event.
                if (isAccessDenied(failure)) {
                    event(workspaceId, file.fileId(), "ACCESS_UNAVAILABLE", null, null,
                        "The submitted file cannot currently be accessed by WildTrack.", null);
                    Boolean lastAccess = db.queryForObject("""
                        SELECT last_accessible FROM monitored_drive_files
                        WHERE workspace_id=? AND file_id=?
                        """, Boolean.class, workspaceId, file.fileId());
                    if (!Boolean.FALSE.equals(lastAccess)) {
                        for (Target target : file.targets()) {
                            try {
                                checks.recordBatchProviderFailure(workspaceId, request(target), true,
                                    "The Drive file is inaccessible. Verify the sharing permissions.");
                                reports++;
                            } catch (IllegalArgumentException staleSubmission) { }
                        }
                    }
                }
                int failures = db.queryForObject("""
                    SELECT failure_count FROM monitored_drive_files WHERE workspace_id=? AND file_id=?
                    """, Integer.class, workspaceId, file.fileId());
                long retrySeconds = Math.min(3600, 120L << Math.min(failures, 4));
                // A transient provider/parse error does not erase previously
                // observed accessibility or create a false ACCESS_RESTORED event.
                db.update("""
                    UPDATE monitored_drive_files SET last_accessible=CASE WHEN ? THEN FALSE ELSE last_accessible END,
                      failure_count=failure_count+1, next_check_at=?
                    WHERE workspace_id=? AND file_id=?
                    """, isAccessDenied(failure), Timestamp.from(now.plusSeconds(retrySeconds)),
                    workspaceId, file.fileId());
            }
        }
        return new Cycle(unique.size(), requests, downloads, reports);
    }

    private Map<String, FileGroup> eligible(UUID workspaceId, Instant now) {
        Map<UUID, Deliverable> byDeliverable = new HashMap<>();
        Map<UUID, List<DeliverableField>> byFields = new HashMap<>();
        Map<String, List<Target>> grouped = new LinkedHashMap<>();
        // An archived snapshot is a finalized response version, not an active
        // submission to poll indefinitely. A later saved revision is separately
        // eligible, because the archive's source version remains immutable.
        java.util.Set<String> finalized = new java.util.HashSet<>(db.query("""
            SELECT response_id,source_response_updated_at FROM archive_records WHERE workspace_id=?
            """, (rs, n) -> rs.getString("response_id") + "|" +
                rs.getTimestamp("source_response_updated_at").toInstant(), workspaceId));
        for (FormResponse response : responses.findAllByWorkspaceId(workspaceId)) {
            if (finalized.contains(response.getId() + "|" + response.getUpdatedAt())) continue;
            Deliverable deliverable = byDeliverable.computeIfAbsent(response.getDeliverableId(),
                id -> deliverables.findById(id).orElse(null));
            if (deliverable == null || deliverable.getDueAt() == null) continue;
            List<DeliverableField> pdfFields = byFields.computeIfAbsent(response.getDeliverableId(),
                id -> fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(id).stream()
                    .filter(f -> f.isActive() && f.getFieldType() == DeliverableFieldType.DRIVE_PDF
                        && f.getDocumentCheckPolicy() != DocumentCheckPolicy.OFF).toList());
            JsonNode values;
            try { values = json.readTree(response.getValuesJson()); }
            catch (Exception invalidStoredResponse) { continue; }
            for (DeliverableField field : pdfFields) {
                String url = values == null ? "" : values.path(field.getFieldKey()).asText("").trim();
                if (url.isBlank()) continue;
                try {
                    String fileId = DriveLinkParser.parse(url).fileId();
                    grouped.computeIfAbsent(fileId, unused -> new ArrayList<>())
                        .add(new Target(response, deliverable, field, url));
                } catch (IllegalArgumentException invalidLink) {
                    // Existing form validation handles malformed submissions.
                }
            }
        }
        Map<String, FileGroup> result = new LinkedHashMap<>();
        grouped.forEach((fileId, targets) -> {
            Target chosen = targets.stream().filter(t -> t.url().contains("resourcekey="))
                .findFirst().orElse(targets.get(0));
            Instant deadline = targets.stream().map(t -> t.deliverable().getDueAt().atZone(MANILA).toInstant())
                .min(Comparator.comparingLong(d -> Math.abs(Duration.between(d, now).toSeconds())))
                .orElse(now);
            result.put(fileId, new FileGroup(fileId, chosen.url(), List.copyOf(targets), deadline));
        });
        return result;
    }

    private void seed(UUID workspaceId, FileGroup file, Instant now) {
        Integer existing = db.queryForObject("""
            SELECT COUNT(*) FROM monitored_drive_files WHERE workspace_id=? AND file_id=?
            """, Integer.class, workspaceId, file.fileId());
        if (existing != null && existing > 0) {
            // Academic Data deadlines are editable. On the next minute tick, move a
            // previously hourly check into its five-minute deadline window without
            // resetting a nearer due check or expanding an existing backoff.
            db.update("""
                UPDATE monitored_drive_files SET next_check_at=?
                WHERE workspace_id=? AND file_id=? AND failure_count=0
                  AND next_check_at > ?
                """, Timestamp.from(now.plus(interval(file.nearestDeadline(), now))),
                workspaceId, file.fileId(),
                Timestamp.from(now.plus(interval(file.nearestDeadline(), now))));
            return;
        }
        String baselineHash = null;
        String baselineMime = null;
        Timestamp baselineModified = null;
        Boolean baselineAccessible = null;
        // Use only a REAL earlier Document Check of the same submitted field and
        // same URL. Otherwise the first metadata poll is merely FIRST OBSERVED;
        // it cannot reconstruct the original contents at submission time.
        for (Target target : file.targets()) {
            var report = previousReports.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
                workspaceId, target.response().getId().toString(), target.field().getId());
            if (report.isEmpty() || !target.url().equals(report.get().getSourceUrl())) continue;
            try {
                JsonNode metadata = json.readTree(report.get().getReportJson()).path("metadata");
                String hash = normalized(metadata.path("md5Checksum").asText(null));
                if (hash == null) continue;
                baselineHash = hash;
                baselineMime = metadata.path("mimeType").asText(null);
                String timestamp = metadata.path("modifiedTime").asText(null);
                if (timestamp != null) baselineModified =
                    Timestamp.from(java.time.OffsetDateTime.parse(timestamp).toInstant());
                baselineAccessible = metadata.path("canDownload").asBoolean(false);
                break;
            } catch (Exception unusableOlderObservation) {
                // An invalid/partial old report cannot establish a baseline.
            }
        }
        try {
            db.update("""
                INSERT INTO monitored_drive_files(workspace_id,file_id,source_url,last_checksum,
                    last_mime,last_modified_at,last_accessible,next_check_at)
                VALUES(?,?,?,?,?,?,?,?)
                """, workspaceId, file.fileId(), file.url(), baselineHash, baselineMime,
                baselineModified, baselineAccessible, Timestamp.from(now.minusSeconds(1)));
        } catch (DataIntegrityViolationException concurrentInsert) {
            // A previous cycle or concurrent dyno already owns the durable state.
        }
    }

    private FileCheckRequest request(Target target) {
        FormResponse response = target.response();
        Deliverable deliverable = target.deliverable();
        String key = deliverable.getTrackerColumnKey() == null || deliverable.getTrackerColumnKey().isBlank()
            ? deliverable.getTitle() : deliverable.getTrackerColumnKey();
        return new FileCheckRequest(response.getId().toString(), target.field().getId(), key,
            target.url(), response.getUpdatedAt().toString());
    }

    private void event(UUID workspaceId, String fileId, String kind,
            String before, String after, String detail, DriveFileMetadata metadata) {
        // Same event state across polling retries must not spam Today's Work.
        List<Boolean> lastSame = db.query("""
            SELECT kind,previous_checksum,current_checksum FROM monitored_drive_events
            WHERE workspace_id=? AND file_id=? ORDER BY observed_at DESC LIMIT 1
            """, (rs, n) -> kind.equals(rs.getString("kind"))
                && Objects.equals(before, rs.getString("previous_checksum"))
                && Objects.equals(after, rs.getString("current_checksum")), workspaceId, fileId);
        if (!lastSame.isEmpty() && lastSame.get(0)) return;
        db.update("""
            INSERT INTO monitored_drive_events(id,workspace_id,file_id,kind,previous_checksum,
              current_checksum,detail,observed_at,provider_modified_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            """, UUID.randomUUID(), workspaceId, fileId, kind, before, after, detail,
            Timestamp.from(Instant.now()), metadata != null && metadata.modifiedTime() != null
                ? Timestamp.from(metadata.modifiedTime().toInstant()) : null);
    }

    static Duration interval(Instant deadline, Instant now) {
        Duration gap = Duration.between(deadline, now);
        return gap.compareTo(Duration.ofHours(-24)) >= 0 && gap.compareTo(Duration.ofHours(48)) <= 0
            ? Duration.ofMinutes(5) : Duration.ofHours(1);
    }

    private static String normalized(String value) {
        return value == null || value.isBlank() ? null : value.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isAccessDenied(RuntimeException exception) {
        // GoogleDriveUnavailableException currently distinguishes 403/404 only by message.
        // Other provider failures are not evidence of an access restriction.
        return exception.getMessage() != null
            && exception.getMessage().contains("Drive file is inaccessible");
    }
}
