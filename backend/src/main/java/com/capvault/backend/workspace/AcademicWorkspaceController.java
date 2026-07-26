package com.capvault.backend.workspace;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspaces")
public class AcademicWorkspaceController {

    private final AcademicWorkspaceService service;

    public AcademicWorkspaceController(AcademicWorkspaceService service) {
        this.service = service;
    }

    @GetMapping
    public List<AcademicWorkspaceResponse> list() {
        return service.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AcademicWorkspaceResponse create(@Valid @RequestBody AcademicWorkspaceRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public AcademicWorkspaceResponse update(
        @PathVariable UUID id,
        @Valid @RequestBody AcademicWorkspaceRequest request
    ) {
        return service.update(id, request);
    }
}
