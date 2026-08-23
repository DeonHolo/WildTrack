package com.capvault.backend.response;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationSecurity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/responses")
public class FormResponseController {

    private final FormResponseService responseService;
    private final StudentAssociationSecurity security;

    public FormResponseController(FormResponseService responseService, StudentAssociationSecurity security) {
        this.responseService = responseService;
        this.security = security;
    }

    public record SubmitRequest(
        @NotNull UUID deliverableId,
        @NotBlank String valuesJson
    ) {
    }

    public record SubmitResponse(
        boolean changed,
        UUID responseId,
        long revision,
        String valuesJson,
        String submittedAt,
        String updatedAt
    ) {
    }

    private static SubmitResponse toSubmitResponse(FormResponseService.SaveResult result) {
        return new SubmitResponse(
            result.changed(),
            result.response().getId(),
            result.clientRevision(),
            result.response().getValuesJson(),
            result.response().getSubmittedAt().toString(),
            result.response().getUpdatedAt().toString()
        );
    }

    @PostMapping("/submit")
    public ResponseEntity<SubmitResponse> submit(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody SubmitRequest request,
        HttpServletRequest http
    ) {
        var session = security.requireSession(http);
        Map<String, Object> values;
        try {
            values = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                request.valuesJson(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalArgumentException("Response values could not be read.");
        }
        try {
            return ResponseEntity.ok(toSubmitResponse(responseService.submit(new FormResponseService.SubmitCommand(
                workspaceId, request.deliverableId(), session.googleSubject(), session.googleEmail(), values))));
        } catch (FormResponseService.ConcurrentModificationException e) {
            return ResponseEntity.status(org.springframework.http.HttpStatus.CONFLICT)
                .header("X-WildTrack-Conflict", "stale-revision")
                .body(null);
        } catch (IllegalStateException e) {
            throw new IllegalArgumentException(e.getMessage());
        }
    }

    @GetMapping("/mine")
    public ResponseEntity<SubmitResponse> mine(
        @RequestParam UUID workspaceId,
        @RequestParam UUID deliverableId,
        HttpServletRequest http
    ) {
        var session = security.requireSession(http);
        return responseService.ownedResponse(workspaceId, deliverableId, session.googleSubject())
            .map(response -> ResponseEntity.ok(new SubmitResponse(
                true, response.getId(), response.getRevision(), response.getValuesJson(),
                response.getSubmittedAt().toString(), response.getUpdatedAt().toString())))
            .orElseGet(() -> ResponseEntity.ok().build());
    }

    @GetMapping("/{deliverableId}/history")
    public List<Map<String, Object>> history(
        @PathVariable UUID deliverableId,
        @RequestParam UUID workspaceId,
        HttpServletRequest http
    ) {
        var session = security.requireSession(http);
        return responseService.history(workspaceId, deliverableId, session.googleSubject());
    }

    /** Staff-facing list for review surfaces (ADMIN sees all; adviser team-filtering lands with ticket 07). */
    @GetMapping("/staff")
    public List<FormResponse> staffView(@RequestParam UUID workspaceId, HttpServletRequest http) {
        if (!security.isAdmin(http)) {
            throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
        }
        return responseService.responsesForWorkspace(workspaceId);
    }
}
