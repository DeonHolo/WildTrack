package com.capvault.backend.staff;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StaffManagementService {

    private final StaffRoleAssignmentRepository roleRepository;
    private final AdviserTeamAssignmentRepository teamRepository;
    private final Clock clock;

    public StaffManagementService(
        StaffRoleAssignmentRepository roleRepository,
        AdviserTeamAssignmentRepository teamRepository,
        Clock clock
    ) {
        this.roleRepository = roleRepository;
        this.teamRepository = teamRepository;
        this.clock = clock;
    }

    public record StaffProfileView(
        UUID id,
        String googleSubject,
        String googleEmail,
        List<String> roles,
        boolean enabled,
        List<String> assignedTeams
    ) {
    }

    @Transactional(readOnly = true)
    public List<StaffProfileView> listStaff(UUID workspaceId) {
        return roleRepository.findAll().stream()
            .map(assignment -> new StaffProfileView(
                assignment.getId(),
                assignment.getGoogleSubject(),
                assignment.getGoogleEmail(),
                roleRepository.findByGoogleSubjectAndEnabledTrue(assignment.getGoogleSubject()).stream()
                    .map(a -> a.getRole().name())
                    .toList(),
                assignment.isEnabled(),
                teamRepository.findAllByGoogleSubjectAndWorkspaceId(assignment.getGoogleSubject(), workspaceId).stream()
                    .map(AdviserTeamAssignment::getTeamCode)
                    .toList()
            ))
            .distinct()
            .toList();
    }

    /** Admin can add or update an allowed staff Google email before its first login. */
    @Transactional
    public StaffProfileView upsertStaffEmail(String googleEmail, List<StaffRole> roles, UUID workspaceId) {
        Instant now = clock.instant();
        // Find or create a placeholder assignment per role (subject binds on first verified login).
        for (StaffRole role : roles) {
            if (roleRepository.findAll().stream()
                .noneMatch(a -> a.getGoogleEmail().equalsIgnoreCase(googleEmail) && a.getRole() == role)) {
                roleRepository.save(new StaffRoleAssignment(
                    UUID.randomUUID(),
                    "pending:" + googleEmail.toLowerCase() + ":" + role.name(),
                    googleEmail.toLowerCase(),
                    role,
                    true,
                    now,
                    now
                ));
            }
        }
        return listStaff(workspaceId).stream()
            .filter(p -> p.googleEmail().equalsIgnoreCase(googleEmail))
            .findFirst()
            .orElseThrow();
    }

    @Transactional
    public void setStaffEnabled(String googleSubject, boolean enabled) {
        roleRepository.findAll().stream()
            .filter(a -> a.getGoogleSubject().equals(googleSubject))
            .forEach(a -> {
                a.setEnabled(enabled);
                a.setUpdatedAt(clock.instant());
                roleRepository.save(a);
            });
    }

    @Transactional
    public void assignTeam(String googleSubject, UUID workspaceId, String teamCode) {
        boolean exists = teamRepository.findAllByGoogleSubjectAndWorkspaceId(googleSubject, workspaceId).stream()
            .anyMatch(a -> a.getTeamCode().equalsIgnoreCase(teamCode));
        if (!exists) {
            teamRepository.save(new AdviserTeamAssignment(
                UUID.randomUUID(), workspaceId, googleSubject, teamCode, clock.instant()));
        }
    }

    @Transactional
    public void unassignTeam(String googleSubject, UUID workspaceId, String teamCode) {
        teamRepository.deleteByWorkspaceIdAndGoogleSubjectAndTeamCode(workspaceId, googleSubject, teamCode);
    }

    @Transactional(readOnly = true)
    public List<String> assignedTeams(String googleSubject, UUID workspaceId) {
        return teamRepository.findAllByGoogleSubjectAndWorkspaceId(googleSubject, workspaceId).stream()
            .map(AdviserTeamAssignment::getTeamCode)
            .toList();
    }
}
