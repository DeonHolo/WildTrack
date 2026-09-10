package com.capvault.backend.aireview;

import java.util.Map;
import java.util.UUID;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai-reviews")
public class AiReviewController {
    private final AiReviewService service;
    private final StudentAssociationSecurity security;
    public AiReviewController(AiReviewService service, StudentAssociationSecurity security) {
        this.service = service; this.security = security;
    }
    public record ReviewRequest(String fieldId, boolean retryAcknowledged, UUID retryToken) { }
    @GetMapping("/status")
    public Map<String, Object> status(HttpServletRequest http) {
        return service.status(security.requireSession(http).googleSubject());
    }
    @PostMapping("/{responseId}")
    public AiReviewService.View review(@PathVariable UUID responseId, @RequestParam UUID workspaceId,
            @RequestBody(required = false) ReviewRequest body, HttpServletRequest http) {
        return service.review(workspaceId, responseId, body == null ? null : body.fieldId(),
            security.requireSession(http).googleSubject(), body != null && body.retryAcknowledged(), body == null ? null : body.retryToken());
    }
    @GetMapping("/{responseId}")
    public AiReviewService.View saved(@PathVariable UUID responseId, @RequestParam UUID workspaceId,
            @RequestParam(required = false) String fieldId, HttpServletRequest http) {
        return service.saved(workspaceId, responseId, fieldId, security.requireSession(http).googleSubject());
    }
}
