package com.capvault.backend.student;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationService.AssociationView;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/students")
public class StudentAssociationController {

    private final StudentAssociationService associationService;
    private final StudentAssociationSecurity security;

    public StudentAssociationController(StudentAssociationService associationService, StudentAssociationSecurity security) {
        this.associationService = associationService;
        this.security = security;
    }

    public record ConfirmRequest(@NotBlank String studentNumber) {
    }

    public record ConflictView(UUID id, UUID studentRecordId, String status, java.time.Instant createdAt) {
    }

    @GetMapping("/me")
    public ResponseEntity<AssociationView> myAssociation(@RequestParam UUID workspaceId, HttpServletRequest request) {
        var session = security.requireSession(request);
        return associationService.activeAssociation(workspaceId, session.googleSubject())
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.ok().build());
    }

    @GetMapping("/options")
    public List<StudentRecordResponse> rosterOptions(@RequestParam UUID workspaceId, HttpServletRequest request) {
        security.requireSession(request);
        return associationService.workspaceRosterOptions(workspaceId);
    }

    @PostMapping("/associate")
    public AssociationView confirm(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody ConfirmRequest body,
        HttpServletRequest request
    ) {
        var session = security.requireSession(request);
        return associationService.confirmAssociation(workspaceId, session.googleSubject(), session.googleEmail(), body.studentNumber());
    }

    @DeleteMapping("/associate")
    public ResponseEntity<Void> disconnect(@RequestParam UUID workspaceId, HttpServletRequest request) {
        var session = security.requireSession(request);
        associationService.disconnect(workspaceId, session.googleSubject());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/identity-conflicts")
    public List<ConflictView> conflicts(@RequestParam UUID workspaceId, HttpServletRequest request) {
        if (!security.isAdmin(request)) {
            throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
        }
        return associationService.conflictsForWorkspace(workspaceId).stream()
            .map(c -> new ConflictView(c.getId(), c.getStudentRecordId(), c.getStatus(), c.getCreatedAt()))
            .toList();
    }
}
