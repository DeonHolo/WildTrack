package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;

/** Staff-scoped monitor notifications and personal dismissals never expose cross-team events. */
class FileMonitorStaffSecurityTest {
    private final JdbcTemplate db = mock(JdbcTemplate.class);
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
    private final StudentAssociationSecurity security = mock(StudentAssociationSecurity.class);
    private final StaffManagementService staff = mock(StaffManagementService.class);
    private final HttpServletRequest http = mock(HttpServletRequest.class);
    private final UUID workspace = UUID.randomUUID();

    @Test
    void ordinaryStudentCannotFetchFileMonitoringOrDismissStaffTasks() {
        var monitor = new FileMonitorEventController(db, responses, fields, security, staff, new ObjectMapper());
        var dismissals = new WorkTaskDismissalController(db, security);
        when(security.requireSession(http)).thenReturn(session());
        when(security.activeRoles(http)).thenReturn(Set.of());
        assertThatThrownBy(() -> monitor.events(workspace, http)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> dismissals.list(workspace, http)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> dismissals.dismiss(
            new WorkTaskDismissalController.Action(workspace, "file:any-event"), http))
            .isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(db, responses, staff);
    }

    @Test
    void adviserWithoutAssignedResponsesDoesNotReceiveWorkspaceWideFileEvents() {
        var monitor = new FileMonitorEventController(db, responses, fields, security, staff, new ObjectMapper());
        when(security.requireSession(http)).thenReturn(session());
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADVISER));
        when(staff.assignedTeams("synthetic-adviser", workspace)).thenReturn(List.of("fictional-team-a"));
        FormResponse otherTeam = new FormResponse(UUID.randomUUID(), workspace, UUID.randomUUID(),
            "fake-student", "fake@example.invalid", UUID.randomUUID(), "99-9999-999",
            "Fictional", "fictional-team-b",
            "{\"documentPdf\":\"https://drive.google.com/file/d/fictional-private-file/view\"}",
            Instant.now(), Instant.now());
        when(responses.findAllByWorkspaceId(workspace)).thenReturn(List.of(otherTeam));
        assertThat(monitor.events(workspace, http)).isEmpty();
        verifyNoInteractions(db);
    }

    @Test
    void adviserCannotLinkEventsThroughAFreeTextDriveUrl() {
        var monitor = new FileMonitorEventController(db, responses, fields, security, staff, new ObjectMapper());
        when(security.requireSession(http)).thenReturn(session());
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADVISER));
        when(staff.assignedTeams("synthetic-adviser", workspace)).thenReturn(List.of("fictional-team-a"));
        UUID deliverableId = UUID.randomUUID();
        FormResponse unrelatedText = new FormResponse(UUID.randomUUID(), workspace, deliverableId,
            "fake-student", "fake@example.invalid", UUID.randomUUID(), "99-9999-999",
            "Fictional", "fictional-team-a",
            "{\"ordinaryText\":\"https://drive.google.com/file/d/fictional-private-file/view\"}",
            Instant.now(), Instant.now());
        when(responses.findAllByWorkspaceId(workspace)).thenReturn(List.of(unrelatedText));
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId))
            .thenReturn(List.of());
        assertThat(monitor.events(workspace, http)).isEmpty();
        verifyNoInteractions(db);
    }

    private static StoredWildTrackSession session() {
        return new StoredWildTrackSession("synthetic-hash", "synthetic-adviser",
            "fake-staff@example.invalid", Instant.now(), Instant.now().plusSeconds(60));
    }
}
