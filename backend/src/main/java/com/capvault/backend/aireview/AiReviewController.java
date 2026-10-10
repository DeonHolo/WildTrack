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
    private AiReviewBatchService batches;
    public AiReviewController(AiReviewService service, StudentAssociationSecurity security) {
        this.service = service; this.security = security;
    }
    @org.springframework.beans.factory.annotation.Autowired
    public AiReviewController(AiReviewService service, StudentAssociationSecurity security,
            org.springframework.beans.factory.ObjectProvider<AiReviewBatchService> batches) {
        this(service, security); this.batches = batches.getIfAvailable();
    }
    public record ReviewRequest(String fieldId, boolean retryAcknowledged, UUID retryToken,
                                boolean rerunRequested) { }
    @GetMapping("/status")
    public Map<String, Object> status(HttpServletRequest http) {
        return service.status(security.requireSession(http).googleSubject());
    }
    @PostMapping("/{responseId}")
    public AiReviewService.View review(@PathVariable UUID responseId, @RequestParam UUID workspaceId,
            @RequestBody(required = false) ReviewRequest body, HttpServletRequest http) {
        String subject = security.requireSession(http).googleSubject();
        var batchState = batches == null ? null : batches.individualDuringBatch(workspaceId, responseId, body == null ? null : body.fieldId(), subject);
        if (batchState != null) return batchState;
        return service.review(workspaceId, responseId, body == null ? null : body.fieldId(),
            subject, body != null && body.retryAcknowledged(),
            body == null ? null : body.retryToken(), body != null && body.rerunRequested());
    }
    @GetMapping("/{responseId}")
    public AiReviewService.View saved(@PathVariable UUID responseId, @RequestParam UUID workspaceId,
            @RequestParam(required = false) String fieldId, HttpServletRequest http) {
        return service.saved(workspaceId, responseId, fieldId, security.requireSession(http).googleSubject());
    }

}
