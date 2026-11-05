package com.capvault.backend.filemonitor;

import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
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
    private static final Pattern DOCUMENT_CHANGE_KEY = Pattern.compile(
        "^document-change:([^:]+):(.+):([^:]+):md5:([a-fA-F0-9]{32}):(\\d{4}-\\d{2}-\\d{2}T.+)$");
    private static final ObjectMapper JSON = new ObjectMapper();
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
        db.update("""
            INSERT INTO work_task_dismissals(workspace_id,google_subject,task_key,dismissed_at)
            VALUES(?,?,?,?) ON CONFLICT DO NOTHING
            """, workspaceId, user, key, OffsetDateTime.now(ZoneOffset.UTC));
    }

    /** Link the acknowledgement to the same saved file revision, never to later changes. */
    private List<String> matchingContentChangeTasks(Action action) {
        var match = DOCUMENT_CHANGE_KEY.matcher(action.taskKey());
        if (!match.matches()) return List.of();
        LocalDateTime checkedAt;
        try {
            // Reports store UTC without an offset. The browser sends millisecond precision.
            checkedAt = OffsetDateTime.parse(match.group(5)).withOffsetSameInstant(ZoneOffset.UTC)
                .toLocalDateTime().truncatedTo(ChronoUnit.MILLIS);
        } catch (DateTimeParseException invalid) {
            return List.of();
        }
        String fileId = match.group(3);
        String checksum = match.group(4).toLowerCase(Locale.ROOT);
        var reports = db.query("""
            SELECT report_json FROM academic_file_check_reports
            WHERE workspace_id=? AND external_response_id=? AND (field_id=? OR field_id IS NULL)
            AND checked_at>=? AND checked_at<?
            ORDER BY CASE WHEN field_id IS NULL THEN 1 ELSE 0 END, checked_at
            """, (rs, n) -> rs.getString(1), action.workspaceId(), match.group(1), match.group(2),
            checkedAt, checkedAt.plus(1, ChronoUnit.MILLIS));
        for (String report : reports) {
            OffsetDateTime modifiedAt;
            try {
                var metadata = JSON.readTree(report).path("metadata");
                if (!fileId.equals(metadata.path("fileId").asText())
                        || !checksum.equalsIgnoreCase(metadata.path("md5Checksum").asText())) continue;
                modifiedAt = OffsetDateTime.parse(metadata.path("modifiedTime").asText(""));
            } catch (IOException | DateTimeParseException invalidReport) {
                continue;
            }
            var tasks = db.query("""
                SELECT id FROM monitored_drive_events WHERE workspace_id=? AND file_id=? AND kind='CONTENT_CHANGED'
                AND LOWER(current_checksum)=? AND provider_modified_at=? AND observed_at<=?
                """, (rs, n) -> "file:" + fileId + ":" + rs.getObject(1, UUID.class),
                action.workspaceId(), fileId, checksum, modifiedAt, OffsetDateTime.now(ZoneOffset.UTC));
            if (!tasks.isEmpty()) return tasks;
        }
        return List.of();
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
