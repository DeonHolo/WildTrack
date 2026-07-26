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

    public ProjectMetadataController(ProjectMetadataRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<ProjectMetadataResponse> listProjects(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return repository.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId)
            .stream()
            .map(ProjectMetadataResponse::from)
            .toList();
    }
}
