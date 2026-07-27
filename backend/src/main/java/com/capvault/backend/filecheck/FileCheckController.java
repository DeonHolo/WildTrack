package com.capvault.backend.filecheck;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/file-checks")
public class FileCheckController {

    private final FileCheckService service;

    public FileCheckController(FileCheckService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public DriveConnectionStatus status() {
        return service.connectionStatus();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FileCheckResponse check(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @Valid @RequestBody FileCheckRequest request
    ) {
        return service.check(workspaceId, request);
    }

    @GetMapping("/{responseId}")
    public FileCheckResponse latest(
        @PathVariable String responseId,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return service.latest(workspaceId, responseId);
    }

    @GetMapping("/{responseId}/history")
    public List<FileCheckResponse> history(
        @PathVariable String responseId,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return service.history(workspaceId, responseId);
    }
}
