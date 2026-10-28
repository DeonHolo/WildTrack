package com.capvault.backend.workspace;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/sources")
public class WorkspaceSourceController {

    private final WorkspaceSourceService service;
    private final com.capvault.backend.student.StudentAssociationSecurity security;

    public WorkspaceSourceController(WorkspaceSourceService service, com.capvault.backend.student.StudentAssociationSecurity security) {
        this.service = service;
        this.security = security;
    }

    @GetMapping
    public List<WorkspaceSourceResponse> listSources(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        jakarta.servlet.http.HttpServletRequest request
    ) {
        if (security.activeRoles(request).isEmpty()) throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
        return service.listSources(workspaceId);
    }

    @PutMapping("/{sourceType}")
    public WorkspaceSourceResponse upsertSource(
        @PathVariable WorkspaceSourceType sourceType,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @Valid @RequestBody WorkspaceSourceRequest request
    ) {
        return service.upsertSource(workspaceId, sourceType, request);
    }
}
