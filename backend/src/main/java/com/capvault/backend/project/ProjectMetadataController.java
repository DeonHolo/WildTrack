package com.capvault.backend.project;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/projects")
public class ProjectMetadataController {

    private final ProjectMetadataRepository repository;
    private final com.capvault.backend.student.StudentAssociationSecurity security;

    public ProjectMetadataController(ProjectMetadataRepository repository, com.capvault.backend.student.StudentAssociationSecurity security) {
        this.repository = repository;
        this.security = security;
    }

    @GetMapping
    public List<ProjectMetadataResponse> listProjects(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        jakarta.servlet.http.HttpServletRequest request
    ) {
        if (!security.isAdmin(request)) throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        return repository.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId)
            .stream()
            .map(ProjectMetadataResponse::from)
            .toList();
    }
}
