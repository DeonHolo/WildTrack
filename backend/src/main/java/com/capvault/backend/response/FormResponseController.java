package com.capvault.backend.response;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;

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
    private final StaffManagementService staffManagementService;
    private final StudentAssociationService associationService;

    public FormResponseController(
        FormResponseService responseService,
        StudentAssociationSecurity security,
        StaffManagementService staffManagementService,
        StudentAssociationService associationService
    ) {
        this.responseService = responseService;
        this.security = security;
        this.staffManagementService = staffManagementService;
        this.associationService = associationService;
    }

    public record SubmitRequest(
        @NotNull UUID deliverableId,
        @NotBlank String valuesJson,
        Long revision
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

    public record StaffScopeResponse(
        List<FormResponse> responses,
        List<String> teamCodes,
        boolean allTeams
    ) {
    }

    public record ScopedResponse(
        UUID id,
        UUID deliverableId,
        String studentNumber,
        String studentName,
        String teamCode,
        String googleSubject,
        String googleEmail,
        String valuesJson,
        String submittedAt,
        String updatedAt,
        boolean owned
    ) {
        public static ScopedResponse from(FormResponse response, boolean includePrivate) {
            return new ScopedResponse(
                response.getId(),
                response.getDeliverableId(),
                response.getStudentNumber(),
                response.getStudentName(),
                response.getTeamCode(),
                includePrivate ? response.getGoogleSubject() : "",
                includePrivate ? response.getGoogleEmail() : "",
                includePrivate ? response.getValuesJson() : "",
                response.getSubmittedAt().toString(),
                response.getUpdatedAt().toString(),
                includePrivate
            );
        }
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
                workspaceId, request.deliverableId(), session.googleSubject(), session.googleEmail(), values, request.revision()))));
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

    /**
     * Staff-facing list for review surfaces. ADMIN reads the whole workspace; an ADVISER
     * is narrowed server-side to the teams assigned to them, so a direct request cannot
     * reach another team's submissions. Non-staff sessions are denied.
     */
    @GetMapping("/staff")
    public List<FormResponse> staffView(@RequestParam UUID workspaceId, HttpServletRequest http) {
        var session = security.requireSession(http);
        var roles = security.activeRoles(http);
        if (roles.contains(StaffRole.ADMIN)) {
            return responseService.responsesForWorkspace(workspaceId);
        }
        if (roles.contains(StaffRole.ADVISER)) {
            return responseService.responsesForTeams(
                workspaceId, staffManagementService.assignedTeams(session.googleSubject(), workspaceId));
        }
        throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
    }

    @GetMapping("/staff-scope")
    public StaffScopeResponse staffScope(@RequestParam UUID workspaceId, HttpServletRequest http) {
        var session = security.requireSession(http);
        var roles = security.activeRoles(http);
        if (roles.contains(StaffRole.ADMIN)) {
            return new StaffScopeResponse(responseService.responsesForWorkspace(workspaceId), List.of(), true);
        }
        if (roles.contains(StaffRole.ADVISER)) {
            var teams = staffManagementService.assignedTeams(session.googleSubject(), workspaceId);
            return new StaffScopeResponse(responseService.responsesForTeams(workspaceId, teams), teams, false);
        }
        throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
    }

    /**
     * Role-scoped response list accessible to students, advisers, and admins.
     */
    @GetMapping("/my-team")
    public List<ScopedResponse> myTeamView(@RequestParam UUID workspaceId, HttpServletRequest http) {
        var session = security.requireSession(http);
        var roles = security.activeRoles(http);
        if (roles.contains(StaffRole.ADMIN)) {
            return responseService.responsesForWorkspace(workspaceId).stream()
                .map(response -> ScopedResponse.from(response, true))
                .toList();
        }
        if (roles.contains(StaffRole.ADVISER)) {
            return responseService.responsesForTeams(
                workspaceId, staffManagementService.assignedTeams(session.googleSubject(), workspaceId)).stream()
                .map(response -> ScopedResponse.from(response, true))
                .toList();
        }
        var assoc = associationService.activeAssociation(workspaceId, session.googleSubject());
        if (assoc.isPresent() && assoc.get().teamCode() != null && !assoc.get().teamCode().isBlank()) {
            return responseService.responsesForTeams(workspaceId, List.of(assoc.get().teamCode())).stream()
                .map(response -> ScopedResponse.from(
                    response, response.getGoogleSubject().equals(session.googleSubject())))
                .toList();
        }
        return responseService.responsesForSubject(workspaceId, session.googleSubject()).stream()
            .map(response -> ScopedResponse.from(response, true))
            .toList();
    }
}
