package com.capvault.backend.filemonitor;

import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Only active staff may see events for submissions in their authorized team scope. */
@RestController
@RequestMapping("/api/file-monitor")
public class FileMonitorEventController {
    private final JdbcTemplate db;
    private final FormResponseRepository responses;
    private final DeliverableFieldRepository deliverableFields;
    private final StudentAssociationSecurity security;
    private final StaffManagementService staff;
    private final ObjectMapper json;
    private final ZoneId checkZone;

    @Autowired
    public FileMonitorEventController(JdbcTemplate db, FormResponseRepository responses,
            DeliverableFieldRepository deliverableFields,
            StudentAssociationSecurity security, StaffManagementService staff, ObjectMapper json) {
        this(db, responses, deliverableFields, security, staff, json, java.time.ZoneOffset.UTC);
    }

    FileMonitorEventController(JdbcTemplate db, FormResponseRepository responses,
            DeliverableFieldRepository deliverableFields, StudentAssociationSecurity security,
            StaffManagementService staff, ObjectMapper json, ZoneId checkZone) {
        this.db = db;
        this.responses = responses;
        this.deliverableFields = deliverableFields;
        this.security = security;
        this.staff = staff;
        this.json = json;
        this.checkZone = checkZone;
    }

    public record Event(UUID id, String fileId, String kind, String detail, Instant observedAt,
            Instant providerModifiedAt, List<UUID> responseIds, List<String> teamCodes, boolean resolved) { }
    private record Target(FormResponse response, String fieldId, String sourceUrl, boolean checkEnabled) { }
    private record CheckKey(String responseId, String fieldId) { }
    private record AccessProof(Instant restoredAt, Instant restrictedAt) {
        AccessProof observe(Instant when, boolean restored) {
            return new AccessProof(restored && (restoredAt == null || when.isAfter(restoredAt)) ? when : restoredAt,
                !restored && (restrictedAt == null || when.isAfter(restrictedAt)) ? when : restrictedAt);
        }
        boolean resolves(Instant alertAt) {
            return restoredAt != null && restoredAt.isAfter(alertAt)
                && (restrictedAt == null || restoredAt.isAfter(restrictedAt));
        }
    }

    @GetMapping("/events")
    public List<Event> events(@RequestParam UUID workspaceId, HttpServletRequest http) {
        var session = security.requireSession(http);
        Set<StaffRole> roles = security.activeRoles(http);
        if (!roles.contains(StaffRole.ADMIN) && !roles.contains(StaffRole.ADVISER)) {
            throw new AccessDeniedException("Staff access is required.");
        }
        boolean admin = roles.contains(StaffRole.ADMIN);
        Set<String> assigned = admin ? Set.of()
            : new HashSet<>(staff.assignedTeams(session.googleSubject(), workspaceId));
        List<FormResponse> visible = responses.findAllByWorkspaceId(workspaceId).stream()
            .filter(response -> admin || assigned.contains(response.getTeamCode()))
            .toList();
        if (visible.isEmpty()) return List.of();

        var fileResponses = new HashMap<String, List<Target>>();
        Map<UUID, Map<String, DeliverableField>> pdfFields = new HashMap<>();
        for (FormResponse response : visible) {
            try {
                JsonNode fields = json.readTree(response.getValuesJson());
                if (fields == null || !fields.isObject()) continue;
                Map<String, DeliverableField> allowedFields = pdfFields.computeIfAbsent(response.getDeliverableId(), id ->
                    deliverableFields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(id).stream()
                        .filter(field -> field.isActive()
                            && field.getFieldType() == DeliverableFieldType.DRIVE_PDF)
                        .collect(java.util.stream.Collectors.toMap(DeliverableField::getFieldKey, field -> field)));
                fields.fields().forEachRemaining(field -> {
                    // An arbitrary free-text URL is not a submitted PDF artifact.
                    // Never use it to associate an unrelated response with an event.
                    var definition = allowedFields.get(field.getKey());
                    if (definition == null || !field.getValue().isTextual()) return;
                    try {
                        String source = field.getValue().asText().trim();
                        var ref = DriveLinkParser.parse(source);
                        fileResponses.computeIfAbsent(ref.fileId(), unused -> new ArrayList<>()).add(new Target(
                            response, definition.getId(), source, definition.getDocumentCheckPolicy() != DocumentCheckPolicy.OFF));
                    } catch (IllegalArgumentException notADriveFile) {
                        // Never expose unrelated Drive files.
                    }
                });
            } catch (Exception invalidRecord) {
                // Incomplete records are not a reason to reveal a private event.
            }
        }
        if (fileResponses.isEmpty()) return List.of();
        // A file ID may also occur in an excluded deliverable. The source file
        // remains one monitored object, but notifications must not imply that
        // submissions outside the Admin's selected deliverables were checked.
        List<Boolean> configuredSelection = db.query("""
            SELECT file_monitor_selection_configured FROM academic_workspaces WHERE id = ?
            """, (rs, row) -> rs.getBoolean(1), workspaceId);
        if (!configuredSelection.isEmpty() && configuredSelection.get(0)) {
            Set<UUID> selectedDeliverables = new HashSet<>(db.query("""
                SELECT deliverable_id FROM workspace_file_monitor_deliverables WHERE workspace_id = ?
                """, (rs, row) -> rs.getObject(1, UUID.class), workspaceId));
            fileResponses.values().forEach(linked -> linked.removeIf(target ->
                !selectedDeliverables.contains(target.response().getDeliverableId())));
            fileResponses.entrySet().removeIf(entry -> entry.getValue().isEmpty());
            if (fileResponses.isEmpty()) return List.of();
        }
        List<Event> events = db.query("""
            SELECT id,file_id,kind,detail,observed_at,provider_modified_at
            FROM monitored_drive_events WHERE workspace_id=? ORDER BY observed_at DESC
            LIMIT 300
            """, (rs, rowNum) -> {
            String fileId = rs.getString("file_id");
            List<Target> linked = fileResponses.getOrDefault(fileId, List.of());
            return new Event((UUID) rs.getObject("id"), fileId, rs.getString("kind"),
                rs.getString("detail"), rs.getTimestamp("observed_at").toInstant(),
                rs.getTimestamp("provider_modified_at") == null ? null
                    : rs.getTimestamp("provider_modified_at").toInstant(),
                linked.stream().map(target -> target.response().getId()).distinct().toList(),
                linked.stream().map(target -> target.response().getTeamCode()).distinct().toList(), false);
        }, workspaceId).stream().filter(event -> !event.responseIds().isEmpty()).toList();
        Instant firstAlert = events.stream().filter(event -> accessAlert(event.kind())).map(Event::observedAt)
            .min(Instant::compareTo).orElse(null);
        if (firstAlert == null) return events;
        var proofs = accessProofs(workspaceId, fileResponses.values().stream().flatMap(List::stream).toList(), firstAlert);
        return events.stream().map(event -> {
            if (!accessAlert(event.kind())) return event;
            var unresolved = fileResponses.get(event.fileId()).stream().filter(target -> !target.checkEnabled()
                || !proofs.getOrDefault(target.sourceUrl(), new AccessProof(null, null)).resolves(event.observedAt())).toList();
            boolean resolved = unresolved.isEmpty();
            var linked = resolved ? fileResponses.get(event.fileId()) : unresolved;
            return new Event(event.id(), event.fileId(), event.kind(), event.detail(), event.observedAt(), event.providerModifiedAt(),
                linked.stream().map(target -> target.response().getId()).distinct().toList(),
                linked.stream().map(target -> target.response().getTeamCode()).distinct().toList(), resolved);
        }).toList();
    }

    private Map<String, AccessProof> accessProofs(UUID workspace, List<Target> targets, Instant after) {
        Map<CheckKey, Target> current = new HashMap<>();
        targets.stream().filter(Target::checkEnabled).forEach(target -> current.put(
            new CheckKey(target.response().getId().toString(), target.fieldId()), target));
        if (current.isEmpty()) return Map.of();
        Map<String, AccessProof> proofs = new HashMap<>();
        var parameters = Map.of("workspace", workspace,
            "responses", current.keySet().stream().map(CheckKey::responseId).distinct().toList(),
            // FileCheckService writes LocalDateTime.now() in the backend's zone, not naive UTC/browser time.
            "after", Timestamp.valueOf(LocalDateTime.ofInstant(after, checkZone)));
        new NamedParameterJdbcTemplate(db).query("""
            SELECT external_response_id, field_id, source_url, report_json, checked_at
            FROM academic_file_check_reports WHERE workspace_id = :workspace
              AND external_response_id IN (:responses) AND checked_at > :after
            """, parameters, rs -> {
            var target = current.get(new CheckKey(rs.getString("external_response_id"), rs.getString("field_id")));
            if (target == null || !target.sourceUrl().equals(rs.getString("source_url"))) return;
            try {
                var report = json.readTree(rs.getString("report_json"));
                if (!target.sourceUrl().equals(report.path("sourceUrl").asText(null))) return;
                var metadata = report.path("metadata");
                var document = report.path("document");
                String fileId = DriveLinkParser.parse(target.sourceUrl()).fileId();
                boolean verified = report.path("status").asText().equals("COMPLETED")
                    && metadata.path("fileId").asText().equals(fileId)
                    && metadata.path("mimeType").asText().equalsIgnoreCase("application/pdf")
                    && metadata.path("canDownload").asBoolean(false) && document.path("readable").asBoolean(false)
                    && document.path("encrypted").isBoolean() && !document.path("encrypted").asBoolean();
                boolean restricted = report.path("status").asText().equals("BLOCKED")
                    && report.path("flags").isArray() && java.util.stream.StreamSupport.stream(report.path("flags").spliterator(), false)
                        .anyMatch(flag -> Set.of("Inaccessible", "Download Disabled").contains(flag.asText()));
                // Transient provider/unknown failures cannot resurrect an access alert already proven resolved.
                if (!verified && !restricted) return;
                Instant checked = rs.getObject("checked_at", LocalDateTime.class).atZone(checkZone).toInstant();
                proofs.compute(target.sourceUrl(), (source, proof) -> (proof == null ? new AccessProof(null, null) : proof).observe(checked, verified));
            } catch (Exception unreadableReport) { /* An incomplete saved check cannot prove restored access. */ }
        });
        return proofs;
    }

    private static boolean accessAlert(String kind) {
        return Set.of("ACCESS_UNAVAILABLE", "DOWNLOAD_UNAVAILABLE").contains(kind);
    }
}
