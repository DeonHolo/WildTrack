package com.capvault.backend.validationstudy;

import java.util.UUID;

import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/validation-study")
public class ValidationStudyController {

    private final ValidationStudyService service;
    private final StudentAssociationSecurity security;

    public ValidationStudyController(ValidationStudyService service, StudentAssociationSecurity security) {
        this.service = service;
        this.security = security;
    }

    @GetMapping("/evidence")
    public ValidationStudyService.Evidence evidence(
        @RequestParam UUID workspaceId,
        @RequestParam UUID deliverableId,
        HttpServletRequest request
    ) {
        if (!security.activeRoles(request).contains(StaffRole.ADMIN)) {
            throw new AccessDeniedException("Admin authorization required.");
        }
        return service.evidence(workspaceId, deliverableId);
    }
}
