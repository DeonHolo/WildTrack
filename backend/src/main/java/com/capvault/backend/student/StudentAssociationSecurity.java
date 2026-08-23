package com.capvault.backend.student;

import java.util.Optional;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.StaffAccessResolver;
import com.capvault.backend.staff.StaffRole;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StudentAssociationSecurity {

    private final WildTrackSessionService sessionService;
    private final StaffAccessResolver staffAccessResolver;

    public StudentAssociationSecurity(WildTrackSessionService sessionService, StaffAccessResolver staffAccessResolver) {
        this.sessionService = sessionService;
        this.staffAccessResolver = staffAccessResolver;
    }

    public StoredWildTrackSession requireSession(HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (var cookie : request.getCookies()) {
                if ("WILDTRACK_SESSION".equals(cookie.getName())) {
                    return sessionService.resolve(cookie.getValue())
                        .orElseThrow(() -> new AccessDeniedException("Authentication required."));
                }
            }
        }
        throw new AccessDeniedException("Authentication required.");
    }

    @Transactional(readOnly = true)
    public boolean isAdmin(HttpServletRequest request) {
        var session = requireSession(request);
        return staffAccessResolver.activeRolesFor(session.googleSubject()).contains(StaffRole.ADMIN);
    }
}
