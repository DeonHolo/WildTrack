package com.capvault.backend.filemonitor;

import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
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
    public record Deletion(UUID workspaceId, List<String> taskKeys) { }

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
    public List<String> dismiss(@RequestBody Action action, HttpServletRequest http) {
        String user = subject(http);
        validate(action);
        var keys = new java.util.ArrayList<String>();
        keys.add(action.taskKey());
        keys.addAll(matchingContentChangeTasks(action));
        keys.forEach(key -> saveDismissal(action.workspaceId(), user, key));
        return List.copyOf(keys);
    }

    private void saveDismissal(UUID workspaceId, String user, String key) {
        db.update("DELETE FROM work_task_dismissals WHERE workspace_id=? AND google_subject=? AND task_key=? AND deleted_at IS NULL",
            workspaceId, user, key);
        try {
            db.update("""
                INSERT INTO work_task_dismissals(workspace_id,google_subject,task_key,dismissed_at)
                VALUES(?,?,?,?)
                """, workspaceId, user, key, Timestamp.from(Instant.now()));
        } catch (DataIntegrityViolationException alreadyDismissed) {
            // Concurrent identical requests have the same final state.
        }
    }

    /** Link the acknowledgement to the same saved file revision, never to later changes. */
    private List<String> matchingContentChangeTasks(Action action) {
        var match = java.util.regex.Pattern.compile("^document-change:([^:]+):([^:]+):([^:]+):md5:([a-fA-F0-9]{32}):(\\d{4}-\\d{2}-\\d{2}T.+)$")
            .matcher(action.taskKey());
        if (!match.matches()) return List.of();
        Instant observed;
        try { observed = java.time.OffsetDateTime.parse(match.group(5)).toInstant(); }
        catch (java.time.format.DateTimeParseException invalid) { return List.of(); }
        var reports = db.query("""
            SELECT report_json FROM academic_file_check_reports
            WHERE workspace_id=? AND external_response_id=? AND field_id=? AND checked_at>=? AND checked_at<=?
            ORDER BY checked_at LIMIT 1
            """, (rs, n) -> rs.getString(1), action.workspaceId(), match.group(1), match.group(2),
            Timestamp.from(observed.minusMillis(1)), Timestamp.from(observed.plusMillis(1)));
        if (reports.isEmpty()) return List.of();
        try {
            var metadata = new com.fasterxml.jackson.databind.ObjectMapper().readTree(reports.getFirst()).path("metadata");
            if (!match.group(3).equals(metadata.path("fileId").asText())
                    || !match.group(4).equalsIgnoreCase(metadata.path("md5Checksum").asText())) return List.of();
            String modified = metadata.path("modifiedTime").asText("");
            if (modified.isBlank()) return List.of();
            var modifiedAt = java.time.OffsetDateTime.parse(modified).toInstant();
            return db.query("""
                SELECT id FROM monitored_drive_events WHERE workspace_id=? AND file_id=? AND kind='CONTENT_CHANGED'
                AND LOWER(current_checksum)=? AND provider_modified_at=? AND observed_at<=?
                """, (rs, n) -> "file:" + match.group(3) + ":" + rs.getObject(1, UUID.class),
                action.workspaceId(), match.group(3), match.group(4).toLowerCase(java.util.Locale.ROOT),
                Timestamp.from(modifiedAt), Timestamp.from(Instant.now()));
        } catch (java.io.IOException | java.time.format.DateTimeParseException invalidReport) { return List.of(); }
    }

    @DeleteMapping
    public void restore(@RequestParam UUID workspaceId, @RequestParam String taskKey, HttpServletRequest http) {
        String user = subject(http);
        validate(new Action(workspaceId, taskKey));
        db.update("DELETE FROM work_task_dismissals WHERE workspace_id=? AND google_subject=? AND task_key=? AND deleted_at IS NULL",
            workspaceId, user, taskKey);
    }

    @GetMapping("/deleted")
    public List<String> deleted(@RequestParam UUID workspaceId, HttpServletRequest http) {
        String user = subject(http);
        return db.query("""
            SELECT task_key FROM work_task_dismissals
            WHERE workspace_id=? AND google_subject=? AND deleted_at IS NOT NULL
            """, (rs, n) -> rs.getString(1), workspaceId, user);
    }

    @PostMapping("/deleted")
    @Transactional
    public List<String> delete(@RequestBody Deletion action, HttpServletRequest http) {
        String user = subject(http);
        if (action == null || action.taskKeys() == null || action.taskKeys().isEmpty() || action.taskKeys().size() > 2000) {
            throw new IllegalArgumentException("Choose dismissed notifications to delete.");
        }
        action.taskKeys().forEach(key -> validate(new Action(action.workspaceId(), key)));
        var parameters = Map.of("workspace", action.workspaceId(), "user", user,
            "keys", action.taskKeys().stream().distinct().toList(), "now", Timestamp.from(Instant.now()));
        var named = new NamedParameterJdbcTemplate(db);
        named.update("""
            UPDATE work_task_dismissals SET deleted_at=COALESCE(deleted_at, :now)
            WHERE workspace_id=:workspace AND google_subject=:user AND task_key IN (:keys)
            """, parameters);
        return named.query("""
            SELECT task_key FROM work_task_dismissals
            WHERE workspace_id=:workspace AND google_subject=:user AND task_key IN (:keys) AND deleted_at IS NOT NULL
            """, parameters, (rs, n) -> rs.getString(1));
    }

    private void validate(Action action) {
        if (action == null || action.workspaceId() == null || action.taskKey() == null
                || action.taskKey().isBlank() || action.taskKey().length() > 500) {
            throw new IllegalArgumentException("Choose a valid workspace task.");
        }
    }
}
