package com.capvault.backend.staff;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.student.StudentAssociationSecurity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workspace/staff")
public class StaffManagementController {

    private final StaffManagementService staffService;
    private final StudentAssociationSecurity security;

    public StaffManagementController(StaffManagementService staffService, StudentAssociationSecurity security) {
        this.staffService = staffService;
        this.security = security;
    }

    public record UpsertRequest(@NotBlank String googleEmail, @NotEmpty List<String> roles) {
    }

    public record AssignTeamRequest(@NotBlank String googleSubject, @NotBlank String teamCode) {
    }

    private void requireAdmin(HttpServletRequest http) {
        if (!security.isAdmin(http)) {
            throw new org.springframework.security.access.AccessDeniedException("Admin authorization required.");
        }
    }

    @GetMapping
    public List<StaffManagementService.StaffProfileView> listStaff(
        @RequestParam UUID workspaceId,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        return staffService.listStaff(workspaceId);
    }

    @PostMapping
    public ResponseEntity<StaffManagementService.StaffProfileView> upsertStaffEmail(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody UpsertRequest request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        var roles = request.roles().stream().map(StaffRole::valueOf).toList();
        return ResponseEntity.ok(staffService.upsertStaffEmail(request.googleEmail(), roles, workspaceId));
    }

    @PostMapping("/assignments")
    public ResponseEntity<Void> assignTeam(
        @RequestParam UUID workspaceId,
        @Valid @RequestBody AssignTeamRequest request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        staffService.assignTeam(request.googleSubject(), workspaceId, request.teamCode());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/assignments")
    public ResponseEntity<Void> unassignTeam(
        @RequestParam UUID workspaceId,
        @RequestParam String googleSubject,
        @RequestParam String teamCode,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        staffService.unassignTeam(googleSubject, workspaceId, teamCode);
        return ResponseEntity.noContent().build();
    }
}
