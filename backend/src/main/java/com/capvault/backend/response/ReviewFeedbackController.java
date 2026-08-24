package com.capvault.backend.response;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.staff.StaffAccessResolver;
import com.capvault.backend.student.StudentAssociationSecurity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/responses")
public class ReviewFeedbackController {

    private final ReviewFeedbackService feedbackService;
    private final StudentAssociationSecurity security;
    private final StaffAccessResolver staffAccessResolver;

    public ReviewFeedbackController(
        ReviewFeedbackService feedbackService,
        StudentAssociationSecurity security,
        StaffAccessResolver staffAccessResolver
    ) {
        this.feedbackService = feedbackService;
        this.security = security;
        this.staffAccessResolver = staffAccessResolver;
    }

    public record FeedbackRequest(@NotBlank String note, @NotBlank String visibility) {
    }

    private java.util.Set<com.capvault.backend.staff.StaffRole> staffRoles(String subject) {
        return staffAccessResolver.activeRolesFor(subject);
    }

    @PostMapping("/{responseId}/feedback")
    public ResponseEntity<Map<String, Object>> saveFeedback(
        @PathVariable UUID responseId,
        @Valid @RequestBody FeedbackRequest request,
        HttpServletRequest http
    ) {
        var session = security.requireSession(http);
        var roles = staffRoles(session.googleSubject());
        if (roles.isEmpty()) {
            throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
        }
        String role = roles.contains(com.capvault.backend.staff.StaffRole.ADMIN) ? "ADMIN" : "ADVISER";
        var feedback = feedbackService.saveFeedback(
            responseId, session.googleSubject(), session.googleEmail(), role,
            request.note(), request.visibility());
        return ResponseEntity.ok(Map.of(
            "id", feedback.getId().toString(),
            "note", feedback.getNote(),
            "visibility", feedback.getVisibility(),
            "updatedAt", feedback.getUpdatedAt().toString()
        ));
    }

    @PostMapping("/{responseId}/accept")
    public ResponseEntity<Map<String, Object>> accept(@PathVariable UUID responseId, HttpServletRequest http) {
        var session = security.requireSession(http);
        var roles = staffRoles(session.googleSubject());
        if (roles.isEmpty()) {
            throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
        }
        String role = roles.contains(com.capvault.backend.staff.StaffRole.ADMIN) ? "ADMIN" : "ADVISER";
        var acceptance = feedbackService.accept(responseId, session.googleSubject(), session.googleEmail(), role);
        return ResponseEntity.ok(Map.of(
            "acceptedAt", acceptance.getAcceptedAt().toString(),
            "acceptedByRole", role
        ));
    }

    @PostMapping("/{responseId}/revoke")
    public ResponseEntity<Void> revoke(@PathVariable UUID responseId, HttpServletRequest http) {
        var session = security.requireSession(http);
        var roles = staffRoles(session.googleSubject());
        if (roles.isEmpty()) {
            throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
        }
        feedbackService.revoke(responseId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{responseId}/feedback")
    public List<Map<String, Object>> feedbackHistory(@PathVariable UUID responseId, HttpServletRequest http) {
        security.requireSession(http);
        return feedbackService.feedbackFor(responseId).stream()
            .map(f -> Map.<String, Object>of(
                "note", f.getNote(),
                "visibility", f.getVisibility(),
                "authorRole", f.getAuthorRole(),
                "updatedAt", f.getUpdatedAt().toString()))
            .toList();
    }
}
