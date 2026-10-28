package com.capvault.backend.template;

import java.util.List;
import java.util.UUID;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/templates/{id}/checklist")
public class TemplateChecklistController {
    private final TemplateChecklistService service;
    private final StudentAssociationSecurity security;
    public TemplateChecklistController(TemplateChecklistService service,StudentAssociationSecurity security) { this.service=service; this.security=security; }
    public record Request(UUID versionId,long expectedRevision,List<TemplateInstructionProtocol.Draft> items) {}
    private String admin(HttpServletRequest request) {
        if (!security.isAdmin(request)) throw new AccessDeniedException("Administrator access required.");
        return security.requireSession(request).googleSubject();
    }
    @GetMapping public TemplateChecklistService.View get(@PathVariable UUID id,@RequestParam UUID workspaceId,HttpServletRequest http) {
        admin(http); return service.get(workspaceId,id);
    }
    @PostMapping("/prepare") public TemplateChecklistService.View prepare(@PathVariable UUID id,@RequestParam UUID workspaceId,@RequestBody Request body,HttpServletRequest http) {
        admin(http); return service.requestPreparation(workspaceId,id,body.versionId(),body.expectedRevision());
    }
    @PostMapping("/rerun") public TemplateChecklistService.View rerun(@PathVariable UUID id,@RequestParam UUID workspaceId,@RequestBody Request body,HttpServletRequest http) {
        admin(http); return service.requestRegeneration(workspaceId,id,body.versionId(),body.expectedRevision());
    }
    @PutMapping public TemplateChecklistService.View save(@PathVariable UUID id,@RequestParam UUID workspaceId,@RequestBody Request body,HttpServletRequest http) {
        admin(http); return service.save(workspaceId,id,body.versionId(),body.expectedRevision(),body.items());
    }
    @PostMapping("/approve") public TemplateChecklistService.View approve(@PathVariable UUID id,@RequestParam UUID workspaceId,@RequestBody Request body,HttpServletRequest http) {
        return service.approve(workspaceId,id,body.versionId(),body.expectedRevision(),admin(http));
    }
    @PostMapping("/unapprove") public TemplateChecklistService.View unapprove(@PathVariable UUID id,@RequestParam UUID workspaceId,@RequestBody Request body,HttpServletRequest http) {
        admin(http); return service.unapprove(workspaceId,id,body.versionId(),body.expectedRevision());
    }
}
