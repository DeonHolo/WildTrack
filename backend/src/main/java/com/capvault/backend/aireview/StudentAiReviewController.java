package com.capvault.backend.aireview;

import java.util.Map;
import java.util.UUID;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
public class StudentAiReviewController {
    private final AiReviewService reviews;
    private final StudentAiReviewRuns runs;
    private final StudentAssociationSecurity security;
    private final DeliverableRepository deliverables;
    public StudentAiReviewController(AiReviewService reviews, StudentAiReviewRuns runs,
            StudentAssociationSecurity security, DeliverableRepository deliverables) {
        this.reviews = reviews; this.runs = runs; this.security = security; this.deliverables = deliverables;
    }
    public record Start(String fieldId, boolean retryAcknowledged, UUID retryToken) { }
    public record Setting(boolean enabled) { }

    @GetMapping("/api/student-ai-reviews/{responseId}")
    public AiReviewService.StudentView saved(@PathVariable UUID responseId, @RequestParam UUID workspaceId,
            @RequestParam(required = false) String fieldId, HttpServletRequest http) {
        return reviews.studentSaved(workspaceId, responseId, fieldId, security.requireSession(http).googleSubject());
    }

    @PostMapping("/api/student-ai-reviews/{responseId}")
    public AiReviewService.StudentView start(@PathVariable UUID responseId, @RequestParam UUID workspaceId,
            @RequestBody(required = false) Start body, HttpServletRequest http) {
        return reviews.studentReview(workspaceId, responseId, body == null ? null : body.fieldId(),
            security.requireSession(http).googleSubject(), body != null && body.retryAcknowledged(),
            body == null ? null : body.retryToken());
    }

    @GetMapping("/api/deliverables/{id}/student-ai-review")
    public Map<String, Boolean> setting(@PathVariable UUID id, @RequestParam UUID workspaceId, HttpServletRequest http) {
        requireAdmin(workspaceId, id, http);
        return Map.of("enabled", runs.enabled(workspaceId, id));
    }

    @PutMapping("/api/deliverables/{id}/student-ai-review")
    public Map<String, Boolean> setting(@PathVariable UUID id, @RequestParam UUID workspaceId,
            @RequestBody Setting body, HttpServletRequest http) {
        requireAdmin(workspaceId, id, http);
        runs.configure(workspaceId, id, body.enabled());
        return Map.of("enabled", body.enabled());
    }

    private void requireAdmin(UUID workspaceId, UUID id, HttpServletRequest http) {
        if (!security.isAdmin(http)) throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        deliverables.findById(id).filter(d -> workspaceId.equals(d.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable not found in this workspace."));
    }
}
