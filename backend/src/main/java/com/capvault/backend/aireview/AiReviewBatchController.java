package com.capvault.backend.aireview;

import java.util.List;
import java.util.UUID;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.bind.annotation.*;

@RestController
@EnableScheduling
@RequestMapping("/api/ai-reviews/batches")
public class AiReviewBatchController {
    private final AiReviewBatchService service;
    private final StudentAssociationSecurity security;
    public AiReviewBatchController(AiReviewBatchService service, StudentAssociationSecurity security) { this.service = service; this.security = security; }
    public record Preparation(List<AiReviewBatchService.Target> targets) { }
    public record Start(long version, String mode, boolean includeOutdated, boolean retryAcknowledged) { }
    @PostMapping
    public AiReviewBatchService.View prepare(@RequestParam UUID workspaceId, @RequestBody Preparation body, HttpServletRequest http) {
        return service.prepare(workspaceId, security.requireSession(http).googleSubject(), body.targets());
    }
    @GetMapping("/latest")
    public AiReviewBatchService.View latest(@RequestParam UUID workspaceId, HttpServletRequest http) {
        return service.latest(workspaceId, security.requireSession(http).googleSubject());
    }
    @GetMapping("/{id}")
    public AiReviewBatchService.View get(@PathVariable UUID id, @RequestParam UUID workspaceId, HttpServletRequest http) {
        return service.get(workspaceId, id, security.requireSession(http).googleSubject());
    }
    @PostMapping("/{id}/start")
    public AiReviewBatchService.View start(@PathVariable UUID id, @RequestParam UUID workspaceId, @RequestBody Start body, HttpServletRequest http) {
        return service.start(workspaceId, id, security.requireSession(http).googleSubject(), body.version(), body.mode(), body.includeOutdated(), body.retryAcknowledged());
    }
    @PostMapping("/{id}/resume")
    public AiReviewBatchService.View resume(@PathVariable UUID id, @RequestParam UUID workspaceId, HttpServletRequest http) {
        return service.resume(workspaceId, id, security.requireSession(http).googleSubject());
    }
    @PostMapping("/{id}/cancel")
    public AiReviewBatchService.View cancel(@PathVariable UUID id, @RequestParam UUID workspaceId, HttpServletRequest http) {
        return service.cancelPreparation(workspaceId, id, security.requireSession(http).googleSubject());
    }
}
