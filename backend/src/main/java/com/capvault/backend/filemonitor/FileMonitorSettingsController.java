package com.capvault.backend.filemonitor;

import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
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

    public record Settings(boolean enabled, boolean configured) { }
    public record Update(Boolean enabled) { }

    public FileMonitorSettingsController(JdbcTemplate db, AcademicWorkspaceRepository workspaces,
            GoogleDriveGateway drive, StudentAssociationSecurity security) {
        this.db = db;
        this.workspaces = workspaces;
        this.drive = drive;
        this.security = security;
    }

    @GetMapping
    public Settings get(@PathVariable UUID workspaceId, HttpServletRequest request) {
        requireAdmin(request);
        requireWorkspace(workspaceId);
        return current(workspaceId);
    }

    @PutMapping
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
        return new Settings(Boolean.TRUE.equals(db.queryForObject(
            "SELECT file_monitor_enabled FROM academic_workspaces WHERE id = ?",
            Boolean.class, workspaceId)), drive.isConfigured());
    }
}
