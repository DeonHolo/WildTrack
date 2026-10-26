package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;

class FileCheckControllerScopeTest {

    private static final UUID WORKSPACE = UUID.randomUUID();
    private static final UUID OTHER_WORKSPACE = UUID.randomUUID();
    private static final UUID RESPONSE = UUID.randomUUID();

    private final FileCheckService service = mock(FileCheckService.class);
    private final GoogleDriveGateway drive = mock(GoogleDriveGateway.class);
    private final StudentAssociationSecurity security = mock(StudentAssociationSecurity.class);
    private final StaffManagementService staff = mock(StaffManagementService.class);
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final HttpServletRequest request = mock(HttpServletRequest.class);
    private final FileCheckController controller = new FileCheckController(service, drive, security, staff, responses);

    @BeforeEach
    void adviserSession() {
        when(security.requireSession(request))
            .thenReturn(new StoredWildTrackSession("hash", "adviser-subject", "adviser@example.test",
                Instant.now(), Instant.now().plusSeconds(300)));
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADVISER));
    }

    @Test
    void assignedAdviserCanSubmitSingleCheck() {
        when(responses.findById(RESPONSE)).thenReturn(java.util.Optional.of(response(WORKSPACE, "TEAM-A")));
        when(staff.assignedTeams("adviser-subject", WORKSPACE)).thenReturn(List.of("TEAM-A"));

        assertDoesNotThrow(() -> controller.check(WORKSPACE, check(RESPONSE), request));

        verify(service).check(eq(WORKSPACE), any(FileCheckRequest.class));
    }

    @Test
    void unassignedAdviserCannotSubmitOrReadSingleCheck() {
        when(responses.findById(RESPONSE)).thenReturn(java.util.Optional.of(response(WORKSPACE, "TEAM-B")));
        when(staff.assignedTeams("adviser-subject", WORKSPACE)).thenReturn(List.of("TEAM-A"));

        assertDenied(() -> controller.check(WORKSPACE, check(RESPONSE), request));
        assertDenied(() -> controller.latest(RESPONSE.toString(), WORKSPACE, null, request));
        assertDenied(() -> controller.history(RESPONSE.toString(), WORKSPACE, null, request));

        verifyNoInteractions(service);
    }

    @Test
    void adviserCannotUseMissingOrCrossWorkspaceResponse() {
        when(responses.findById(RESPONSE)).thenReturn(java.util.Optional.of(response(OTHER_WORKSPACE, "TEAM-A")));

        assertDenied(() -> controller.check(WORKSPACE, check(RESPONSE), request));
        assertDenied(() -> controller.latest(RESPONSE.toString(), WORKSPACE, null, request));
        assertDenied(() -> controller.history("missing-response", WORKSPACE, null, request));

        verifyNoInteractions(service);
    }

    @Test
    void adminRetainsWorkspaceWideAndLegacyResponseAccess() {
        when(security.activeRoles(request)).thenReturn(Set.of(StaffRole.ADMIN));

        assertDoesNotThrow(() -> controller.check(WORKSPACE, check("legacy-response"), request));
        verify(service).check(eq(WORKSPACE), any(FileCheckRequest.class));
    }

    private void assertDenied(ThrowingCall call) {
        assertThatThrownBy(call::run).isInstanceOf(AccessDeniedException.class);
    }

    private static FileCheckRequest check(UUID responseId) {
        return check(responseId.toString());
    }

    private static FileCheckRequest check(String responseId) {
        return new FileCheckRequest(responseId, "SRS", "https://drive.google.com/file/d/file-id/view", "2026-09-11T05:00:00Z");
    }

    private static FormResponse response(UUID responseId, UUID workspaceId, String teamCode) {
        Instant now = Instant.parse("2026-09-10T21:00:00Z");
        return new FormResponse(responseId, workspaceId, UUID.randomUUID(), "student-subject", "student@example.test",
            UUID.randomUUID(), "20260001", "Student", teamCode, "{}", now, now);
    }

    private static FormResponse response(UUID workspaceId, String teamCode) {
        return response(RESPONSE, workspaceId, teamCode);
    }

    @FunctionalInterface
    private interface ThrowingCall {
        void run();
    }
}
