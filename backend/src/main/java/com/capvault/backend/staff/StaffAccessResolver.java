package com.capvault.backend.staff;

import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.auth.WildTrackSessionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StaffAccessResolver {

    private final WildTrackSessionService sessionService;
    private final StaffAccessService staffAccessService;

    public StaffAccessResolver(WildTrackSessionService sessionService, StaffAccessService staffAccessService) {
        this.sessionService = sessionService;
        this.staffAccessService = staffAccessService;
    }

    /** Called after backend-verified Google sign-in to bind allowlisted staff roles before the session is issued. */
    @Transactional
    public void onBindLogin(String googleSubject, String googleEmail) {
        staffAccessService.bindStaffRolesOnFirstLogin(googleSubject, googleEmail);
    }

    @Transactional(readOnly = true)
    public Optional<StaffPrincipal> resolveFromSession(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            return Optional.empty();
        }
        Optional<StoredWildTrackSession> session = sessionService.resolve(rawSessionToken);
        if (session.isEmpty()) {
            return Optional.empty();
        }
        Set<StaffRole> roles = EnumSet.copyOf(staffAccessService.activeRolesFor(session.get().googleSubject()));
        if (roles.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new StaffPrincipal(session.get().googleSubject(), session.get().googleEmail(), roles));
    }

    /** Disabling access also revokes any live sessions so revocation takes effect immediately. */
    @Transactional
    public void revokeStaffAccess(String googleSubject, com.capvault.backend.staff.StaffRole role) {
        staffAccessService.setEnabled(googleSubject, role, false);
        sessionService.revokeAllForSubject(googleSubject);
    }
}
