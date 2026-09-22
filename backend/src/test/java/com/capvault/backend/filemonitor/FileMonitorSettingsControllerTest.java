package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
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

        assertThat(controller.get(first.getId(), request)).isEqualTo(
            new FileMonitorSettingsController.Settings(false, true));
        assertThat(controller.update(first.getId(), new FileMonitorSettingsController.Update(true), request))
            .isEqualTo(new FileMonitorSettingsController.Settings(true, true));
        assertThat(controller.get(second.getId(), request).enabled()).isFalse();
        assertThat(controller.update(first.getId(), new FileMonitorSettingsController.Update(false), request).enabled())
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
            new FileMonitorSettingsController.Update(true), request))
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
            new FileMonitorSettingsController.Update(true), request))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode())
                .isEqualTo(HttpStatus.CONFLICT));
        assertThat(controller.get(workspace.getId(), request).enabled()).isFalse();
        var archived = workspaces.findById(workspace.getId()).orElseThrow();
        archived.setActive(false);
        workspaces.saveAndFlush(archived);
        assertThat(archived.isActive()).isFalse();
        assertThatThrownBy(() -> controller.update(workspace.getId(),
            new FileMonitorSettingsController.Update(false), request))
            .isInstanceOf(ResponseStatusException.class);
    }

    private FileMonitorSettingsController controller() {
        return new FileMonitorSettingsController(db, workspaces, drive, security);
    }

    private AcademicWorkspace workspace(String code) {
        return workspaces.saveAndFlush(new AcademicWorkspace(
            "Synthetic monitor " + code, "IT", "MONITOR-SETTINGS-" + code,
            "Semester 1", "2099-2100", true));
    }
}
