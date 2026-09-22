package com.capvault.backend.filemonitor;

import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Admin-owned, durable workspace switch; never requires users to supply workspace UUIDs or env variables. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/file-monitor")
public class FileMonitorSettingsController {
    private final JdbcTemplate db;
    private final AcademicWorkspaceRepository workspaces;
    private final GoogleDriveGateway drive;
    private final StudentAssociationSecurity security;
    private final DeliverableRepository deliverables;
    private final DeliverableFieldRepository fields;

    public record DeliverableSetting(UUID id, String title, LocalDateTime dueAt, boolean enabled) { }
    public record Settings(boolean enabled, boolean configured,
            boolean deliverableSelectionConfigured, List<DeliverableSetting> deliverables) { }
    /** Null IDs preserves the existing selection, [] intentionally disables every deliverable. */
    public record Update(Boolean enabled, List<UUID> deliverableIds) { }

    public FileMonitorSettingsController(JdbcTemplate db, AcademicWorkspaceRepository workspaces,
            GoogleDriveGateway drive, StudentAssociationSecurity security,
            DeliverableRepository deliverables, DeliverableFieldRepository fields) {
        this.db = db;
        this.workspaces = workspaces;
        this.drive = drive;
        this.security = security;
        this.deliverables = deliverables;
        this.fields = fields;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public Settings get(@PathVariable UUID workspaceId, HttpServletRequest request) {
        requireAdmin(request);
        requireWorkspace(workspaceId);
        return current(workspaceId);
    }

    @PutMapping
    @Transactional
    public Settings update(@PathVariable UUID workspaceId, @RequestBody Update update,
            HttpServletRequest request) {
        requireAdmin(request);
        requireWorkspace(workspaceId);
        if (update == null || update.enabled() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose whether to enable monitoring.");
        }
        if (update.enabled() && !drive.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Google Drive access is not configured for this server. Monitoring was not enabled.");
        }
        if (update.deliverableIds() != null) {
            List<Deliverable> eligible = eligibleDeliverables(workspaceId);
            Set<UUID> validIds = new HashSet<>();
            eligible.forEach(deliverable -> validIds.add(deliverable.getId()));
            Set<UUID> selectedIds = new HashSet<>(update.deliverableIds());
            if (update.deliverableIds().stream().anyMatch(id -> id == null || !validIds.contains(id))
                    || selectedIds.size() != update.deliverableIds().size()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choose only eligible PDF deliverables from the selected workspace.");
            }
            // Publish one complete per-deliverable selection in the same transaction as
            // its configured flag and workspace toggle. Never silently enable future deliverables.
            db.update("UPDATE academic_workspaces SET file_monitor_selection_configured = TRUE WHERE id = ?",
                workspaceId);
            db.update("DELETE FROM workspace_file_monitor_deliverables WHERE workspace_id = ?", workspaceId);
            for (UUID deliverableId : selectedIds) {
                db.update("INSERT INTO workspace_file_monitor_deliverables(workspace_id, deliverable_id) VALUES (?, ?)",
                    workspaceId, deliverableId);
            }
        }
        db.update("UPDATE academic_workspaces SET file_monitor_enabled = ? WHERE id = ? AND active = TRUE",
            update.enabled(), workspaceId);
        return current(workspaceId);
    }

    private void requireAdmin(HttpServletRequest request) {
        security.requireSession(request);
        if (!security.activeRoles(request).contains(StaffRole.ADMIN)) {
            throw new AccessDeniedException("Admin authorization is required to change monitoring settings.");
        }
    }

    private void requireWorkspace(UUID workspaceId) {
        if (workspaces.findById(workspaceId).filter(workspace -> workspace.isActive()).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active workspace was not found.");
        }
    }

    private Settings current(UUID workspaceId) {
        var selection = db.queryForMap("""
            SELECT file_monitor_enabled, file_monitor_selection_configured
            FROM academic_workspaces WHERE id = ?
            """, workspaceId);
        boolean configuredSelection = Boolean.TRUE.equals(selection.get("file_monitor_selection_configured"));
        Set<UUID> selected = new HashSet<>(db.query("""
            SELECT deliverable_id FROM workspace_file_monitor_deliverables WHERE workspace_id = ?
            """, (rs, row) -> rs.getObject(1, UUID.class), workspaceId));
        List<DeliverableSetting> options = eligibleDeliverables(workspaceId).stream()
            .map(deliverable -> new DeliverableSetting(deliverable.getId(), deliverable.getTitle(),
                deliverable.getDueAt(), !configuredSelection || selected.contains(deliverable.getId())))
            .toList();
        return new Settings(Boolean.TRUE.equals(selection.get("file_monitor_enabled")),
            drive.isConfigured(), configuredSelection, options);
    }

    private List<Deliverable> eligibleDeliverables(UUID workspaceId) {
        return deliverables.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId).stream()
            .filter(deliverable -> deliverable.getDueAt() != null && fields
                .findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable.getId()).stream()
                .anyMatch(field -> field.isActive() && field.getFieldType() == DeliverableFieldType.DRIVE_PDF
                    && field.getDocumentCheckPolicy() != DocumentCheckPolicy.OFF))
            .toList();
    }
}
