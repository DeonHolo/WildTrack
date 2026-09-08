package com.capvault.backend.staff;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class StaffManagementServiceTest {

    @Autowired
    private StaffManagementService service;

    @Autowired
    private StaffRoleAssignmentRepository roleRepository;

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired private com.capvault.backend.student.StudentRecordRepository students;
    @Autowired private StaffAccessService access;

    private UUID workspaceId;

    @BeforeEach
    void seed() {
        var ws = workspaceRepository.save(new AcademicWorkspace("IT332", "IT", "IT332", "Sem 1", "2026-27", true));
        workspaceId = ws.getId();
        for (String team : List.of("2526-it41-t01", "2526-it41-t02", "team-x")) {
            students.save(new com.capvault.backend.student.StudentRecord(workspaceId, null, "Student", team,
                "1", "A", "Imported Adviser", null, 1));
        }
        // A real bound adviser
        roleRepository.save(new StaffRoleAssignment(
            UUID.randomUUID(), "sub-adviser-1", "adviser1@school.edu", StaffRole.ADVISER, true,
            java.time.Instant.now(), java.time.Instant.now()));
        roleRepository.save(new StaffRoleAssignment(
            UUID.randomUUID(), "sub-admin", "sir.ralph@gmail.com", StaffRole.ADMIN, true,
            java.time.Instant.now(), java.time.Instant.now()));
    }

    @Test
    void adminCanAddStaffEmailBeforeFirstLogin() {
        var view = service.upsertStaffEmail("new.adviser@school.edu", List.of(StaffRole.ADVISER), workspaceId);

        assertThat(view.googleEmail()).isEqualTo("new.adviser@school.edu");
        assertThat(view.roles()).contains("ADVISER");
        // Placeholder subject starts with pending: until first verified login binds it.
        assertThat(view.googleSubject()).startsWith("pending:");
    }

    @Test
    void listShowsRolesAndAssignments() {
        service.assignTeam("sub-adviser-1", workspaceId, "2526-it41-t01");
        service.assignTeam("sub-adviser-1", workspaceId, "2526-it41-t02");

        var profiles = service.listStaff(workspaceId);
        var adviser = profiles.stream().filter(p -> p.googleSubject().equals("sub-adviser-1")).findFirst().orElseThrow();

        assertThat(adviser.roles()).containsExactly("ADVISER");
        assertThat(adviser.assignedTeams()).hasSize(2);
    }

    @Test
    void unassignRemovesTeamLinkOnly() {
        service.assignTeam("sub-adviser-1", workspaceId, "team-x");
        service.unassignTeam("sub-adviser-1", workspaceId, "team-x");

        assertThat(service.assignedTeams("sub-adviser-1", workspaceId)).isEmpty();
        // Role untouched:
        var roles = roleRepository.findByGoogleSubjectAndEnabledTrue("sub-adviser-1");
        assertThat(roles).hasSize(1);
    }

    @Test
    void disablingStaffRevokesAllTheirRoles() {
        service.setStaffEnabled("sub-adviser-1", false);

        var roles = roleRepository.findByGoogleSubjectAndEnabledTrue("sub-adviser-1");
        assertThat(roles).isEmpty();
    }

    @Test
    void pendingAdviserNameAndTeamsBindOnVerifiedLogin() {
        var profile = service.saveProfile(workspaceId, new StaffManagementService.SaveRequest(
            " NEW@school.edu ", "ADVISER", "Dr. Example", List.of("team-x"), null, java.util.Map.of(), false, false));
        assertThat(profile.assignedTeams()).containsExactly("team-x");
        access.bindStaffRolesOnFirstLogin("verified-new", "new@school.edu");
        var bound = service.listStaff(workspaceId).stream().filter(p -> p.googleEmail().equals("new@school.edu")).findFirst().orElseThrow();
        assertThat(bound.googleSubject()).isEqualTo("verified-new");
        assertThat(bound.adviserName()).isEqualTo("Dr. Example");
        assertThat(bound.assignedTeams()).containsExactly("team-x");
        assertThat(access.activeRolesFor("verified-new")).containsExactly(StaffRole.ADVISER);
    }

    @Test
    void transferRequiresConfirmationAndRejectsStaleOwnerWithoutPartialSave() {
        service.assignTeam("sub-adviser-1", workspaceId, "team-x");
        var owners = java.util.Map.of("team-x", "sub-adviser-1");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.saveProfile(workspaceId,
            new StaffManagementService.SaveRequest("new@school.edu", "ADVISER", "New Adviser", List.of("team-x"), null, owners, false, false)))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(service.listStaff(workspaceId)).noneMatch(p -> p.googleEmail().equals("new@school.edu"));
        assertThat(service.assignedTeams("sub-adviser-1", workspaceId)).containsExactly("team-x");
        var saved = service.saveProfile(workspaceId, new StaffManagementService.SaveRequest(
            "new@school.edu", "ADVISER", "New Adviser", List.of("team-x"), null, owners, true, false));
        assertThat(saved.assignedTeams()).containsExactly("team-x");
        assertThat(service.assignedTeams("sub-adviser-1", workspaceId)).isEmpty();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.saveProfile(workspaceId,
            new StaffManagementService.SaveRequest("other@school.edu", "ADVISER", "Other", List.of("team-x"), null, owners, true, false)))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(service.assignedTeams(saved.googleSubject(), workspaceId)).containsExactly("team-x");
    }
}
