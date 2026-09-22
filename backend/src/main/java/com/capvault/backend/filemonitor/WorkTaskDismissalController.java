package com.capvault.backend.filemonitor;

import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Personal, workspace-scoped dismissal is not deletion of a submission or audit evidence. */
@RestController
@RequestMapping("/api/work-task-dismissals")
public class WorkTaskDismissalController {
    private final JdbcTemplate db;
    private final StudentAssociationSecurity security;

    public WorkTaskDismissalController(JdbcTemplate db, StudentAssociationSecurity security) {
        this.db = db;
        this.security = security;
    }
    public record Action(UUID workspaceId, String taskKey) { }

    private String subject(HttpServletRequest http) {
        var session = security.requireSession(http);
        Set<StaffRole> roles = security.activeRoles(http);
        if (!roles.contains(StaffRole.ADMIN) && !roles.contains(StaffRole.ADVISER)) {
            throw new AccessDeniedException("Staff access is required.");
        }
        return session.googleSubject();
    }

    @GetMapping
    public List<String> list(@RequestParam UUID workspaceId, HttpServletRequest http) {
        String user = subject(http);
        return db.query("""
            SELECT task_key FROM work_task_dismissals WHERE workspace_id=? AND google_subject=?
            ORDER BY dismissed_at DESC
            """, (rs, n) -> rs.getString(1), workspaceId, user);
    }

    @PostMapping
    @Transactional
    public void dismiss(@RequestBody Action action, HttpServletRequest http) {
        String user = subject(http);
        validate(action);
        db.update("DELETE FROM work_task_dismissals WHERE workspace_id=? AND google_subject=? AND task_key=?",
            action.workspaceId(), user, action.taskKey());
        try {
            db.update("""
                INSERT INTO work_task_dismissals(workspace_id,google_subject,task_key,dismissed_at)
                VALUES(?,?,?,?)
                """, action.workspaceId(), user, action.taskKey(), Timestamp.from(Instant.now()));
        } catch (DataIntegrityViolationException alreadyDismissed) {
            // Concurrent identical requests have the same final state.
        }
    }

    @DeleteMapping
    public void restore(@RequestParam UUID workspaceId, @RequestParam String taskKey, HttpServletRequest http) {
        String user = subject(http);
        validate(new Action(workspaceId, taskKey));
        db.update("DELETE FROM work_task_dismissals WHERE workspace_id=? AND google_subject=? AND task_key=?",
            workspaceId, user, taskKey);
    }

    private void validate(Action action) {
        if (action == null || action.workspaceId() == null || action.taskKey() == null
                || action.taskKey().isBlank() || action.taskKey().length() > 500) {
            throw new IllegalArgumentException("Choose a valid workspace task.");
        }
    }
}
