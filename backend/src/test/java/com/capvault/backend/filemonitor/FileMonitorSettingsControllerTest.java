package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.List;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Durable UI opt-in: admin-only, workspace-specific, and no implicit Drive requests. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FileMonitorSettingsControllerTest {
    @Autowired JdbcTemplate db;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired DeliverableRepository deliverables;
    @Autowired DeliverableFieldRepository fields;
    @MockBean GoogleDriveGateway drive;
    @MockBean StudentAssociationSecurity security;
    private final HttpServletRequest request = mock(HttpServletRequest.class);

    @Test
    void adminCanEnableAndDisableOnlySelectedWorkspaceWithConfiguredDrive() {
        var first = workspace("FIRST");
        var second = workspace("SECOND");
        var controller = controller();
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADMIN));
        when(drive.isConfigured()).thenReturn(true);

        assertThat(controller.get(first.getId(), request).enabled()).isFalse();
        assertThat(controller.get(first.getId(), request).configured()).isTrue();
        assertThat(controller.update(first.getId(), new FileMonitorSettingsController.Update(true, null), request)
            .enabled()).isTrue();
        assertThat(controller.get(second.getId(), request).enabled()).isFalse();
        assertThat(controller.update(first.getId(), new FileMonitorSettingsController.Update(false, null), request).enabled())
            .isFalse();
        assertThat(controller.get(first.getId(), request).enabled()).isFalse();
        verify(drive, never()).getMetadata(any());
    }

    @Test
    void studentAndAdviserCannotReadOrChangeSwitch() {
        var workspace = workspace("ACCESS");
        var controller = controller();
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADVISER));
        assertThatThrownBy(() -> controller.get(workspace.getId(), request))
            .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(true, null), request))
            .isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(drive);
        assertThat(db.queryForObject("SELECT file_monitor_enabled FROM academic_workspaces WHERE id = ?",
            Boolean.class, workspace.getId())).isFalse();
    }

    @Test
    void unavailableDriveOrArchivedWorkspaceCannotBeEnabled() {
        var workspace = workspace("OFFLINE");
        var controller = controller();
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADMIN));
        when(drive.isConfigured()).thenReturn(false);
        assertThat(controller.get(workspace.getId(), request).configured()).isFalse();
        assertThatThrownBy(() -> controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(true, null), request))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT));
        assertThat(controller.get(workspace.getId(), request).enabled()).isFalse();
        var archived = workspaces.findById(workspace.getId()).orElseThrow();
        archived.setActive(false);
        workspaces.saveAndFlush(archived);
        assertThat(archived.isActive()).isFalse();
        assertThatThrownBy(() -> controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(false, null), request))
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void deliberateDeliverableSelectionPersistsIncludingEmptyAndRejectsAnotherWorkspaceId() {
        var workspace = workspace("SELECT");
        var other = workspace("OTHER");
        var first = deliverable(workspace.getId(), "First");
        var second = deliverable(workspace.getId(), "Second");
        var foreign = deliverable(other.getId(), "Foreign");
        var controller = controller();
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADMIN));
        when(drive.isConfigured()).thenReturn(true);

        var defaults = controller.get(workspace.getId(), request);
        assertThat(defaults.deliverableSelectionConfigured()).isFalse();
        assertThat(defaults.deliverables()).hasSize(2).allMatch(option -> option.enabled());
        assertThatThrownBy(() -> controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(true, List.of(foreign.getId())), request))
            .isInstanceOf(ResponseStatusException.class);
        assertThat(controller.get(workspace.getId(), request).deliverableSelectionConfigured()).isFalse();

        var selected = controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(true, List.of(first.getId())), request);
        assertThat(selected.deliverableSelectionConfigured()).isTrue();
        assertThat(selected.deliverables().stream().filter(option -> option.enabled()).map(option -> option.id()))
            .containsExactly(first.getId());
        assertThat(selected.deliverables().stream().filter(option -> !option.enabled()).map(option -> option.id()))
            .containsExactly(second.getId());

        var none = controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(false, List.of()), request);
        assertThat(none.deliverableSelectionConfigured()).isTrue();
        assertThat(none.deliverables()).allMatch(option -> !option.enabled());
        deliverable(workspace.getId(), "New");
        var afterEnable = controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(true, null), request);
        assertThat(afterEnable.deliverables()).hasSize(3).allMatch(option -> !option.enabled());
        verify(drive, never()).getMetadata(any());
    }

    private FileMonitorSettingsController controller() {
        return new FileMonitorSettingsController(db, workspaces, drive, security, deliverables, fields);
    }

    private AcademicWorkspace workspace(String code) {
        return workspaces.saveAndFlush(new AcademicWorkspace(
            "Synthetic monitor " + code, "IT", "MONITOR-SETTINGS-" + code,
            "Semester 1", "2099-2100", true));
    }

    private Deliverable deliverable(UUID workspaceId, String title) {
        var deliverable = deliverables.saveAndFlush(new Deliverable(workspaceId,
            "monitor-column-" + title, title, "monitor-" + title.toLowerCase(), "Only test files",
            LocalDateTime.of(2099, 9, 22, 17, 0), true, DeliverableStatus.PUBLISHED));
        fields.saveAndFlush(new DeliverableField(UUID.randomUUID().toString(), deliverable.getId(),
            "pdf", "PDF", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.MANUAL, false, true));
        return deliverable;
    }
}
