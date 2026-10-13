package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.access.AccessDeniedException;

class WorkTaskDeletionTest {
    private JdbcTemplate db;
    private WorkTaskDismissalController controller;
    private final StudentAssociationSecurity security = mock(StudentAssociationSecurity.class);
    private final HttpServletRequest http = mock(HttpServletRequest.class);
    private final UUID workspace = UUID.randomUUID();

    @BeforeEach void setup() {
        db = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", ""));
        db.execute("""
            CREATE TABLE work_task_dismissals (
              workspace_id UUID, google_subject VARCHAR(200), task_key VARCHAR(500),
              dismissed_at TIMESTAMP WITH TIME ZONE, deleted_at TIMESTAMP WITH TIME ZONE,
              PRIMARY KEY(workspace_id, google_subject, task_key))
            """);
        controller = new WorkTaskDismissalController(db, security);
        when(security.requireSession(http)).thenReturn(new StoredWildTrackSession("test-session", "staff-one",
            "staff@example.invalid", Instant.now(), Instant.now().plusSeconds(60)));
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADMIN));
    }

    @Test void deletesOnlyOwnDismissedKeysAndDoesNotReopenOnRestoreOrRedismiss() {
        controller.dismiss(new WorkTaskDismissalController.Action(workspace, "file:old-event"), http);
        UUID otherWorkspace = UUID.randomUUID();
        db.update("INSERT INTO work_task_dismissals(workspace_id,google_subject,task_key) VALUES(?,?,?)", workspace, "other-staff", "file:old-event");
        db.update("INSERT INTO work_task_dismissals(workspace_id,google_subject,task_key) VALUES(?,?,?)", otherWorkspace, "staff-one", "file:old-event");
        assertThat(controller.delete(new WorkTaskDismissalController.Deletion(workspace,
            List.of("file:old-event", "file:not-dismissed")), http)).containsExactly("file:old-event");
        assertThat(controller.deleted(workspace, http)).containsExactly("file:old-event");
        assertThat(controller.list(workspace, http)).containsExactly("file:old-event");
        controller.restore(workspace, "file:old-event", http);
        controller.dismiss(new WorkTaskDismissalController.Action(workspace, "file:old-event"), http);
        assertThat(controller.deleted(workspace, http)).containsExactly("file:old-event");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM work_task_dismissals WHERE deleted_at IS NULL", Integer.class)).isEqualTo(2);
        controller.dismiss(new WorkTaskDismissalController.Action(workspace, "file:new-event"), http);
        assertThat(controller.list(workspace, http)).containsExactlyInAnyOrder("file:old-event", "file:new-event");
        assertThat(controller.deleted(workspace, http)).doesNotContain("file:new-event");
    }

    @Test void deletionIsIdempotentAndRejectsMalformedOrStudentRequests() {
        controller.dismiss(new WorkTaskDismissalController.Action(workspace, "review:one"), http);
        var deletion = new WorkTaskDismissalController.Deletion(workspace, List.of("review:one", "review:one"));
        assertThat(controller.delete(deletion, http)).containsExactly("review:one");
        assertThat(controller.delete(deletion, http)).containsExactly("review:one");
        assertThatThrownBy(() -> controller.delete(new WorkTaskDismissalController.Deletion(workspace, List.of()), http))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> controller.delete(new WorkTaskDismissalController.Deletion(null, List.of("review:one")), http))
            .isInstanceOf(IllegalArgumentException.class);
        when(security.activeRoles(http)).thenReturn(Set.of());
        assertThatThrownBy(() -> controller.deleted(workspace, http)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.delete(deletion, http)).isInstanceOf(AccessDeniedException.class);
    }
}
