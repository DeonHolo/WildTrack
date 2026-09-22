package com.capvault.backend.filemonitor;

import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
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

    public FileMonitorEventController(JdbcTemplate db, FormResponseRepository responses,
            DeliverableFieldRepository deliverableFields,
            StudentAssociationSecurity security, StaffManagementService staff, ObjectMapper json) {
        this.db = db;
        this.responses = responses;
        this.deliverableFields = deliverableFields;
        this.security = security;
        this.staff = staff;
        this.json = json;
    }

    public record Event(UUID id, String fileId, String kind, String detail, Instant observedAt,
            Instant providerModifiedAt, List<UUID> responseIds, List<String> teamCodes) { }

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

        var fileResponses = new HashMap<String, List<FormResponse>>();
        Map<UUID, Set<String>> pdfFieldKeys = new HashMap<>();
        for (FormResponse response : visible) {
            try {
                JsonNode fields = json.readTree(response.getValuesJson());
                if (fields == null || !fields.isObject()) continue;
                Set<String> allowedKeys = pdfFieldKeys.computeIfAbsent(response.getDeliverableId(), id ->
                    deliverableFields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(id).stream()
                        .filter(field -> field.isActive()
                            && field.getFieldType() == DeliverableFieldType.DRIVE_PDF)
                        .map(com.capvault.backend.deliverable.DeliverableField::getFieldKey)
                        .collect(java.util.stream.Collectors.toSet()));
                fields.fields().forEachRemaining(field -> {
                    // An arbitrary free-text URL is not a submitted PDF artifact.
                    // Never use it to associate an unrelated response with an event.
                    if (!allowedKeys.contains(field.getKey()) || !field.getValue().isTextual()) return;
                    try {
                        var ref = DriveLinkParser.parse(field.getValue().asText());
                        fileResponses.computeIfAbsent(ref.fileId(), unused -> new ArrayList<>()).add(response);
                    } catch (IllegalArgumentException notADriveFile) {
                        // Never expose unrelated Drive files.
                    }
                });
            } catch (Exception invalidRecord) {
                // Incomplete records are not a reason to reveal a private event.
            }
        }
        if (fileResponses.isEmpty()) return List.of();
        return db.query("""
            SELECT id,file_id,kind,detail,observed_at,provider_modified_at
            FROM monitored_drive_events WHERE workspace_id=? ORDER BY observed_at DESC
            LIMIT 300
            """, (rs, rowNum) -> {
            String fileId = rs.getString("file_id");
            List<FormResponse> linked = fileResponses.getOrDefault(fileId, List.of());
            return new Event((UUID) rs.getObject("id"), fileId, rs.getString("kind"),
                rs.getString("detail"), rs.getTimestamp("observed_at").toInstant(),
                rs.getTimestamp("provider_modified_at") == null ? null
                    : rs.getTimestamp("provider_modified_at").toInstant(),
                linked.stream().map(FormResponse::getId).distinct().toList(),
                linked.stream().map(FormResponse::getTeamCode).distinct().toList());
        }, workspaceId).stream().filter(event -> !event.responseIds().isEmpty()).toList();
    }
}
