package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.sql.Timestamp;
import java.sql.ResultSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
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

    @Test
    void sharedFileEventNamesOnlyResponsesFromSelectedDeliverables() throws Exception {
        var controller = new FileMonitorEventController(db, responses, fields, security, staff,
            new ObjectMapper());
        when(security.requireSession(http)).thenReturn(session());
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADMIN));
        UUID selectedDeliverable = UUID.randomUUID();
        UUID excludedDeliverable = UUID.randomUUID();
        String link = "https://drive.google.com/file/d/fictional-shared-monitor-pdf/view";
        var selected = new FormResponse(UUID.randomUUID(), workspace, selectedDeliverable,
            "selected-student", "selected@example.invalid", UUID.randomUUID(), "99-1001", "Selected Student",
            "team-one", "{\"pdf\":\"" + link + "\"}", Instant.now(), Instant.now());
        var excluded = new FormResponse(UUID.randomUUID(), workspace, excludedDeliverable,
            "excluded-student", "excluded@example.invalid", UUID.randomUUID(), "99-1002", "Excluded Student",
            "team-two", "{\"pdf\":\"" + link + "\"}", Instant.now(), Instant.now());
        when(responses.findAllByWorkspaceId(workspace)).thenReturn(List.of(selected, excluded));
        var pdfField = new DeliverableField(UUID.randomUUID().toString(), selectedDeliverable,
            "pdf", "Submitted PDF", DeliverableFieldType.DRIVE_PDF, true, 0,
            DocumentCheckPolicy.MANUAL, false, true);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(selectedDeliverable))
            .thenReturn(List.of(pdfField));
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(excludedDeliverable))
            .thenReturn(List.of(pdfField));
        UUID eventId = UUID.randomUUID();
        when(db.query(anyString(), any(RowMapper.class), eq(workspace))).thenAnswer(call -> {
            String sql = call.getArgument(0);
            if (sql.contains("file_monitor_selection_configured")) return List.of(true);
            if (sql.contains("SELECT deliverable_id")) return List.of(selectedDeliverable);
            if (sql.contains("FROM monitored_drive_events")) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getObject("id")).thenReturn(eventId);
                when(rs.getString("file_id")).thenReturn("fictional-shared-monitor-pdf");
                when(rs.getString("kind")).thenReturn("CONTENT_CHANGED");
                when(rs.getString("detail")).thenReturn("A verified content change.");
                when(rs.getTimestamp("observed_at")).thenReturn(Timestamp.from(Instant.now()));
                RowMapper<?> mapper = call.getArgument(1);
                return List.of(mapper.mapRow(rs, 0));
            }
            throw new IllegalStateException("Unexpected monitor query: " + sql);
        });
        var events = controller.events(workspace, http);
        assertThat(events).hasSize(1);
        assertThat(events.get(0).responseIds()).containsExactly(selected.getId());
        assertThat(events.get(0).teamCodes()).containsExactly("team-one");
    }

    private static StoredWildTrackSession session() {
        return new StoredWildTrackSession("synthetic-hash", "synthetic-adviser",
            "fake-staff@example.invalid", Instant.now(), Instant.now().plusSeconds(60));
    }
}
