package com.capvault.backend.student;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ValidationParticipantController {
    private final ValidationParticipantEntry entry;
    private final StudentAssociationSecurity security;

    public ValidationParticipantController(ValidationParticipantEntry entry, StudentAssociationSecurity security) {
        this.entry = entry;
        this.security = security;
    }

    @PostMapping("/api/workspace/students/validation-entry")
    public StudentAssociationService.AssociationView join(HttpServletRequest request) {
        var session = security.requireSession(request);
        if (!security.activeRoles(request).isEmpty()) throw new AccessDeniedException("Staff accounts keep their existing workspace access.");
        return entry.join(session.googleSubject(), session.googleEmail(), null).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.CONFLICT, "Automatic entry is closed or this account already has a class connection. Reload to continue."));
    }
}
