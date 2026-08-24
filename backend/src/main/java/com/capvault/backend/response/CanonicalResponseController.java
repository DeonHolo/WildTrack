package com.capvault.backend.response;

import java.util.Map;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationSecurity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/responses/canonical")
public class CanonicalResponseController {

    private final CanonicalResponseService canonicalService;
    private final StudentAssociationSecurity security;

    public CanonicalResponseController(CanonicalResponseService canonicalService, StudentAssociationSecurity security) {
        this.canonicalService = canonicalService;
        this.security = security;
    }

    public record SelectRequest(
        @NotNull UUID deliverableId,
        @NotNull UUID studentRecordId,
        @NotNull UUID responseId,
        @NotBlank String reason
    ) {
    }

    @PostMapping("/select")
    public ResponseEntity<Map<String, Object>> select(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody SelectRequest request,
        HttpServletRequest http
    ) {
        if (!security.isAdmin(http)) {
            throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        }
        var session = security.requireSession(http);
        var selection = canonicalService.selectCanonical(
            workspaceId,
            request.deliverableId(),
            request.studentRecordId(),
            request.responseId(),
            session.googleSubject(),
            request.reason()
        );
        return ResponseEntity.ok(Map.of(
            "canonicalResponseId", selection.getCanonicalResponseId().toString(),
            "previousResponseId", selection.getPreviousResponseId() == null ? "" : selection.getPreviousResponseId().toString(),
            "reason", selection.getReason() == null ? "" : selection.getReason(),
            "selectedAt", selection.getCreatedAt().toString()
        ));
    }
}
