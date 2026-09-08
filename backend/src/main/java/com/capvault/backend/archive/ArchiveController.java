package com.capvault.backend.archive;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationSecurity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/archive")
public class ArchiveController {

    private final ArchiveService archiveService;
    private final StudentAssociationSecurity security;

    public ArchiveController(ArchiveService archiveService, StudentAssociationSecurity security) {
        this.archiveService = archiveService;
        this.security = security;
    }

    public record ArchiveRequest(@NotEmpty List<@NotNull UUID> responseIds) {
    }

    @GetMapping
    public List<ArchiveRecordResponse> list(@RequestParam UUID workspaceId, HttpServletRequest http) {
        requireAdmin(http);
        return archiveService.list(workspaceId);
    }

    @PostMapping
    public List<ArchiveRecordResponse> archive(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody ArchiveRequest request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        return archiveService.archive(workspaceId, request.responseIds());
    }

    private void requireAdmin(HttpServletRequest request) {
        if (!security.isAdmin(request)) throw new AccessDeniedException("Admin authorization required.");
    }
}
