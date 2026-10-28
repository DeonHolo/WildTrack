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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ContentDisposition;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/archive")
public class ArchiveController {

    private final ArchiveService archiveService;
    private final StudentAssociationSecurity security;

    public ArchiveController(ArchiveService archiveService, StudentAssociationSecurity security) {
        this.archiveService = archiveService;
        this.security = security;
    }

    public record ArchiveRequest(@NotEmpty @jakarta.validation.constraints.Size(max=100) List<@NotNull UUID> responseIds) {
    }
    public record VersionRequest(@NotNull @jakarta.validation.constraints.PositiveOrZero Long stateVersion) { }

    @GetMapping("/storage")
    public ArchiveService.StorageStatus storage(HttpServletRequest http) {
        requireAdmin(http);
        return archiveService.storageStatus();
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
        return archiveService.archive(workspaceId, request.responseIds(), security.requireSession(http).googleSubject());
    }

    @PostMapping("/{id}/unarchive")
    public ArchiveRecordResponse unarchive(@PathVariable UUID id, @RequestParam UUID workspaceId,
        @Valid @RequestBody VersionRequest request,HttpServletRequest http) {
        requireAdmin(http);
        return archiveService.unarchive(workspaceId,id,request.stateVersion(),security.requireSession(http).googleSubject());
    }

    @PostMapping("/{id}/retry")
    public ArchiveRecordResponse retry(@PathVariable UUID id, @RequestParam UUID workspaceId,
        @Valid @RequestBody VersionRequest request,HttpServletRequest http) {
        requireAdmin(http);
        return archiveService.retry(workspaceId,id,request.stateVersion(),security.requireSession(http).googleSubject());
    }

    @PostMapping("/{id}/verify")
    public ArchiveRecordResponse verify(@PathVariable UUID id, @RequestParam UUID workspaceId,HttpServletRequest http) {
        requireAdmin(http);
        return archiveService.verify(workspaceId,id,security.requireSession(http).googleSubject());
    }

    @GetMapping("/{id}/files/{fileId}")
    public ResponseEntity<byte[]> download(@PathVariable UUID id,@PathVariable UUID fileId,
        @RequestParam UUID workspaceId,HttpServletRequest http) {
        requireAdmin(http);
        byte[] bytes=archiveService.download(workspaceId,id,fileId);
        var file=archiveService.get(workspaceId,id).files().stream().filter(item -> fileId.equals(item.id())).findFirst().orElseThrow();
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).contentLength(bytes.length)
            .header(HttpHeaders.CACHE_CONTROL,"no-store")
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment()
                .filename(file.filename()==null?"Archived.pdf":file.filename(),StandardCharsets.UTF_8).build().toString())
            .body(bytes);
    }

    private void requireAdmin(HttpServletRequest request) {
        if (!security.isAdmin(request)) throw new AccessDeniedException("Admin authorization required.");
    }
}
