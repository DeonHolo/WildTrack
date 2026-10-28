package com.capvault.backend.template;

import java.util.List;
import java.util.UUID;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/templates/checklists")
public class TemplateChecklistBatchController {
    private final TemplateChecklistService service;
    private final StudentAssociationSecurity security;
    public TemplateChecklistBatchController(TemplateChecklistService service,StudentAssociationSecurity security) {
        this.service=service; this.security=security;
    }
    private void admin(HttpServletRequest http) {
        if (!security.isAdmin(http)) throw new AccessDeniedException("Administrator access required.");
        security.requireSession(http);
    }
    @GetMapping
    public List<TemplateChecklistService.BatchItem> get(@RequestParam UUID workspaceId,HttpServletRequest http) {
        admin(http); return service.batch(workspaceId);
    }
    @PostMapping("/prepare")
    public List<TemplateChecklistService.BatchItem> prepare(@RequestParam UUID workspaceId,
            @RequestBody List<TemplateChecklistService.BatchRequest> selected,HttpServletRequest http) {
        admin(http); return service.requestBatch(workspaceId,selected);
    }
    @PostMapping("/approve")
    public List<TemplateChecklistService.BatchItem> approve(@RequestParam UUID workspaceId,
            @RequestBody List<TemplateChecklistService.ApprovalRequest> selected,HttpServletRequest http) {
        admin(http);
        return service.approveBatch(workspaceId,selected,security.requireSession(http).googleSubject());
    }
}
