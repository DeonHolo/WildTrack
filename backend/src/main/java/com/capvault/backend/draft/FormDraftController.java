package com.capvault.backend.draft;

import java.util.Map;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationSecurity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/drafts")
public class FormDraftController {

    private final FormDraftService draftService;
    private final StudentAssociationSecurity security;

    public FormDraftController(FormDraftService draftService, StudentAssociationSecurity security) {
        this.draftService = draftService;
        this.security = security;
    }

    public record SaveRequest(@NotNull UUID deliverableId, String valuesJson, Long revision) {
    }

    @PostMapping("/save")
    public ResponseEntity<FormDraftService.DraftState> save(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody SaveRequest request,
        HttpServletRequest http
    ) {
        var session = security.requireSession(http);
        Map<String, Object> values;
        try {
            values = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                request.valuesJson() == null ? "{}" : request.valuesJson(), Map.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Draft values could not be read.");
        }
        try {
            return ResponseEntity.ok(draftService.save(workspaceId, request.deliverableId(), session.googleSubject(), values, request.revision()));
        } catch (FormDraftService.StaleRevisionException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).header("X-WildTrack-Conflict", "stale-draft").build();
        }
    }

    @GetMapping
    public ResponseEntity<FormDraftService.DraftState> restore(
        @RequestParam UUID workspaceId,
        @RequestParam UUID deliverableId,
        HttpServletRequest http
    ) {
        var session = security.requireSession(http);
        return draftService.restore(workspaceId, deliverableId, session.googleSubject())
            .map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.ok().body(new FormDraftService.DraftState(false, null, 0L, false, null)));
    }

    @DeleteMapping
    public ResponseEntity<Void> clear(
        @RequestParam UUID workspaceId,
        @RequestParam UUID deliverableId,
        HttpServletRequest http
    ) {
        var session = security.requireSession(http);
        draftService.clear(workspaceId, deliverableId, session.googleSubject());
        return ResponseEntity.noContent().build();
    }
}
