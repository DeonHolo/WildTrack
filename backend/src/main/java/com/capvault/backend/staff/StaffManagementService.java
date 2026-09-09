package com.capvault.backend.staff;

import java.time.Clock;
import java.util.*;
import java.util.stream.Collectors;
import java.nio.charset.StandardCharsets;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StaffManagementService {
    private final StaffRoleAssignmentRepository roleRepository;
    private final AdviserTeamAssignmentRepository teamRepository;
    private final StaffDirectoryLockRepository directory;
    private final StudentRecordRepository students;
    private final ProjectMetadataRepository projects;
    private final AcademicWorkspaceRepository workspaces;
    private final Clock clock;

    public StaffManagementService(StaffRoleAssignmentRepository roles, AdviserTeamAssignmentRepository teams,
            StaffDirectoryLockRepository directory, StudentRecordRepository students,
            ProjectMetadataRepository projects, AcademicWorkspaceRepository workspaces, Clock clock) {
        this.roleRepository = roles;
        this.teamRepository = teams;
        this.directory = directory;
        this.students = students;
        this.projects = projects;
        this.workspaces = workspaces;
        this.clock = clock;
    }

    public record StaffProfileView(UUID id, String googleSubject, String googleEmail, List<String> roles,
            boolean enabled, List<String> assignedTeams, String adviserName, String revision) { }

    public record SaveRequest(String googleEmail, String role, String adviserName, List<String> teamCodes,
            String expectedRevision, Map<String, String> teamOwners, boolean confirmTransfers, boolean reactivate) { }

    @Transactional(readOnly = true)
    public List<StaffProfileView> listStaff(UUID workspaceId) {
        var teams = teamRepository.findAllByWorkspaceId(workspaceId);
        return roleRepository.findAll().stream().collect(Collectors.groupingBy(a -> normalize(a.getGoogleEmail())))
            .values().stream().map(rows -> profile(rows, teams))
            .sorted(Comparator.comparing(StaffProfileView::googleEmail)).toList();
    }

    private StaffProfileView profile(List<StaffRoleAssignment> rows, List<AdviserTeamAssignment> teams) {
        var first = rows.stream().min(Comparator.comparing(a -> a.getId().toString())).orElseThrow();
        var subjects = rows.stream().map(StaffRoleAssignment::getGoogleSubject).collect(Collectors.toSet());
        var assigned = teams.stream().filter(t -> subjects.contains(t.getGoogleSubject())).toList();
        boolean enabled = rows.stream().anyMatch(StaffRoleAssignment::isEnabled);
        var roles = rows.stream().filter(a -> !enabled || a.isEnabled()).map(a -> a.getRole().name()).distinct().sorted().toList();
        var version = new ArrayList<String>();
        rows.forEach(a -> version.add(a.getId() + ":" + a.isEnabled() + ":" + a.getUpdatedAt() + ":" + a.getGoogleSubject() + ":" + a.getAdviserName()));
        assigned.forEach(t -> version.add(t.getId() + ":" + t.getGoogleSubject() + ":" + t.getTeamCode()));
        Collections.sort(version);
        return new StaffProfileView(first.getId(), canonicalSubject(rows), normalize(first.getGoogleEmail()), roles, enabled,
            assigned.stream().map(AdviserTeamAssignment::getTeamCode).distinct().sorted().toList(),
            rows.stream().map(StaffRoleAssignment::getAdviserName).filter(Objects::nonNull).filter(n -> !n.isBlank()).findFirst().orElse(""),
            UUID.nameUUIDFromBytes(String.join("|", version).getBytes(StandardCharsets.UTF_8)).toString());
    }

    /** Single transaction: validate the full plan before changing any role or assignment. */
    @Transactional
    public StaffProfileView saveProfile(UUID workspaceId, SaveRequest request) {
        directory.lockDirectory();
        workspaces.findById(workspaceId).orElseThrow(() -> new IllegalArgumentException("Workspace not found."));
        String email = normalize(request.googleEmail());
        if (email.length() > 254 || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            throw new IllegalArgumentException("Enter a valid Google email.");
        var rows = roleRepository.findAll().stream().filter(a -> normalize(a.getGoogleEmail()).equals(email)).toList();
        var allTeams = teamRepository.findAllByWorkspaceId(workspaceId);
        StaffProfileView existing = rows.isEmpty() ? null : profile(rows, allTeams);
        if (existing == null ? request.expectedRevision() != null : !Objects.equals(existing.revision(), request.expectedRevision()))
            throw conflict("This staff record changed or already exists. Reload it and review your changes.");
        if (existing != null && !existing.enabled() && !request.reactivate())
            throw conflict("This staff member is disabled. Choose Reactivate explicitly.");
        Set<StaffRole> roles;
        if (request.role() == null && existing != null) {
            roles = existing.roles().stream().map(StaffRole::valueOf).collect(Collectors.toSet());
        } else {
            try { roles = Set.of(StaffRole.valueOf(request.role())); }
            catch (RuntimeException e) { throw new IllegalArgumentException("Choose Administrator or Adviser."); }
        }
        String subject = existing == null ? "pending:" + email : existing.googleSubject();
        var subjects = rows.stream().map(StaffRoleAssignment::getGoogleSubject).collect(Collectors.toSet());
        String name = request.adviserName() == null && existing != null ? existing.adviserName()
            : String.valueOf(Objects.requireNonNullElse(request.adviserName(), "")).trim().replaceAll("\\s+", " ");
        if (name.length() > 200) throw new IllegalArgumentException("Adviser name must be 200 characters or fewer.");
        List<String> selected = null;
        if (request.teamCodes() != null) {
            var known = knownTeams(workspaceId);
            if (existing != null) existing.assignedTeams().forEach(team -> known.putIfAbsent(normalize(team), team));
            selected = request.teamCodes().stream().map(code -> {
                String canonical = known.get(normalize(code));
                if (canonical == null) throw conflict("Team " + code + " is no longer in the imported records. Reload the teams.");
                return canonical;
            }).distinct().toList();
            for (String team : selected) {
                var holders = allTeams.stream().filter(t -> t.getTeamCode().equalsIgnoreCase(team))
                    .filter(t -> !subjects.contains(t.getGoogleSubject())).map(AdviserTeamAssignment::getGoogleSubject).distinct().toList();
                if (holders.size() > 1) throw conflict("Team " + team + " has conflicting assignments. Resolve them before transferring.");
                String holder = holders.isEmpty() ? "" : holders.get(0);
                String expected = request.teamOwners() == null ? "" : Objects.requireNonNullElse(request.teamOwners().get(team), "");
                // The editor may include this person's current ownership in its snapshot.
                if (subjects.contains(expected)) expected = "";
                if (!holder.equals(expected)) throw conflict("The adviser for " + team + " changed. Reload and review the assignment.");
                if (!holder.isBlank() && !request.confirmTransfers()) throw conflict("Confirm the transfer of " + team + " before saving.");
            }
        }
        // Reuse each existing role; an unchanged selection preserves multiple existing roles.
        for (StaffRole role : StaffRole.values()) {
            var matches = rows.stream().filter(a -> a.getRole() == role).toList();
            boolean enabled = roles.contains(role);
            if (matches.isEmpty() && enabled) {
                var row = new StaffRoleAssignment(UUID.randomUUID(), subject, email, role, true, clock.instant(), clock.instant());
                row.setAdviserName(name);
                roleRepository.save(row);
            } else {
                for (var row : matches) {
                    row.setEnabled(enabled);
                    row.setAdviserName(name);
                    row.setUpdatedAt(clock.instant());
                }
            }
        }
        if (selected != null) {
            var desired = selected.stream().map(StaffManagementService::normalize).collect(Collectors.toSet());
            var removals = allTeams.stream().filter(t -> subjects.contains(t.getGoogleSubject())
                || desired.contains(normalize(t.getTeamCode()))).toList();
            teamRepository.deleteAll(removals);
            teamRepository.flush();
            for (String team : selected) teamRepository.save(new AdviserTeamAssignment(UUID.randomUUID(), workspaceId, subject, team, clock.instant()));
        }
        roleRepository.flush();
        return listStaff(workspaceId).stream().filter(p -> p.googleEmail().equals(email)).findFirst().orElseThrow();
    }

    /** Legacy add endpoint preserves existing access rather than silently modifying a duplicate. */
    @Transactional
    public StaffProfileView upsertStaffEmail(String email, List<StaffRole> roles, UUID workspaceId) {
        directory.lockDirectory();
        var existing = listStaff(workspaceId).stream().filter(p -> p.googleEmail().equals(normalize(email))).findFirst();
        if (existing.isPresent()) return existing.get();
        if (roles.size() != 1) throw new IllegalArgumentException("Choose one staff role.");
        return saveProfile(workspaceId, new SaveRequest(email, roles.get(0).name(), "", null, null, Map.of(), false, false));
    }

    @Transactional
    public void setStaffEnabled(String subject, boolean enabled) {
        directory.lockDirectory();
        var all = roleRepository.findAll();
        var emails = all.stream().filter(a -> a.getGoogleSubject().equals(subject))
            .map(a -> normalize(a.getGoogleEmail())).collect(Collectors.toSet());
        var affected = all.stream().filter(a -> emails.contains(normalize(a.getGoogleEmail()))).toList();
        affected.forEach(a -> {
            a.setEnabled(enabled); a.setUpdatedAt(clock.instant());
        });
        if (!enabled) affected.stream().map(StaffRoleAssignment::getGoogleSubject).distinct()
            .forEach(old -> teamRepository.deleteAll(teamRepository.findAllByGoogleSubject(old)));
    }

    @Transactional
    public void assignTeam(String subject, UUID workspaceId, String teamCode) {
        directory.lockDirectory();
        String canonicalTeam = knownTeams(workspaceId).get(normalize(teamCode));
        if (canonicalTeam == null) throw new IllegalArgumentException("Choose a team from the imported class records.");
        if (roleRepository.findByGoogleSubjectAndEnabledTrue(subject).isEmpty())
            throw new IllegalArgumentException("Choose an enabled adviser.");
        var holders = teamRepository.findAllByWorkspaceId(workspaceId).stream()
            .filter(t -> t.getTeamCode().equalsIgnoreCase(canonicalTeam)).toList();
        if (holders.stream().anyMatch(t -> !t.getGoogleSubject().equals(subject)))
            throw conflict("This team already has an adviser. Use the reviewed transfer workflow.");
        if (holders.isEmpty()) teamRepository.save(new AdviserTeamAssignment(UUID.randomUUID(), workspaceId, subject, canonicalTeam, clock.instant()));
    }

    @Transactional
    public void unassignTeam(String subject, UUID workspaceId, String teamCode) {
        directory.lockDirectory();
        teamRepository.deleteByWorkspaceIdAndGoogleSubjectAndTeamCode(workspaceId, subject, teamCode);
    }

    @Transactional(readOnly = true)
    public List<String> assignedTeams(String subject, UUID workspaceId) {
        return teamRepository.findAllByGoogleSubjectAndWorkspaceId(subject, workspaceId).stream().map(AdviserTeamAssignment::getTeamCode).toList();
    }

    /** Called only after Google has verified both the subject and email. */
    @Transactional
    public void bindPending(String subject, String email) {
        directory.lockDirectory();
        var pending = roleRepository.findAll().stream()
            .filter(a -> a.getGoogleSubject().startsWith("pending:") && normalize(a.getGoogleEmail()).equals(normalize(email))).toList();
        for (var row : pending) {
            String oldSubject = row.getGoogleSubject();
            var bound = roleRepository.findByGoogleSubjectAndRole(subject, row.getRole());
            if (bound.isPresent()) {
                // A disabled record must never regain access merely by signing in.
                bound.get().setEnabled(bound.get().isEnabled() && row.isEnabled());
                if (row.getAdviserName() != null) bound.get().setAdviserName(row.getAdviserName());
                roleRepository.delete(row);
            } else row.setGoogleSubject(subject);
            for (var assignment : teamRepository.findAllByGoogleSubject(oldSubject)) {
                boolean duplicate = teamRepository.findAllByGoogleSubjectAndWorkspaceId(subject, assignment.getWorkspaceId()).stream()
                    .anyMatch(t -> t.getTeamCode().equalsIgnoreCase(assignment.getTeamCode()));
                if (duplicate) teamRepository.delete(assignment);
                else assignment.setGoogleSubject(subject);
            }
            roleRepository.flush();
            teamRepository.flush();
        }
    }

    private Map<String, String> knownTeams(UUID workspaceId) {
        Map<String, String> teams = new LinkedHashMap<>();
        students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)
            .forEach(s -> { if (s.getTeamCode() != null && !s.getTeamCode().isBlank()) teams.put(normalize(s.getTeamCode()), s.getTeamCode()); });
        projects.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId)
            .forEach(p -> { if (p.getGroupCode() != null && !p.getGroupCode().isBlank()) teams.put(normalize(p.getGroupCode()), p.getGroupCode()); });
        return teams;
    }

    public record TeamChoice(UUID workspaceId, String workspaceName, String teamCode, List<String> adviserNames) { }
    public record Assignment(UUID workspaceId, String teamCode) { }
    public record DirectoryProfile(StaffProfileView profile, List<Assignment> assignments) { }
    public record DirectoryView(List<DirectoryProfile> profiles, List<TeamChoice> teams, List<UUID> workspaceIds) { }
    public record DirectorySave(String googleEmail, String role, String adviserName, List<Assignment> assignments,
            String expectedRevision, Map<String, String> teamOwners, boolean confirmTransfers, boolean reactivate,
            List<UUID> workspaceIds) { }

    @Transactional(readOnly = true)
    public DirectoryView staffDirectory() {
        var active = workspaces.findAllByOrderByActiveDescProgramAscCourseCodeAscAcademicYearDescSemesterAsc()
            .stream().filter(w -> w.isActive()).toList();
        var activeIds = active.stream().map(w -> w.getId()).toList();
        var teams = new ArrayList<TeamChoice>();
        for (var workspace : active) {
            var names = new LinkedHashMap<String, Set<String>>();
            students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspace.getId())
                .forEach(row -> addImportedName(names, row.getTeamCode(), row.getAdviserName()));
            projects.findAllByWorkspaceIdOrderByGroupCodeAsc(workspace.getId())
                .forEach(row -> addImportedName(names, row.getGroupCode(), row.getAdviserName()));
            knownTeams(workspace.getId()).forEach((key, team) -> teams.add(new TeamChoice(workspace.getId(),
                workspace.getName(), team, new ArrayList<>(names.getOrDefault(key, Set.of())))));
        }
        var assignments = teamRepository.findAll();
        var profiles = roleRepository.findAll().stream().collect(Collectors.groupingBy(a -> normalize(a.getGoogleEmail())))
            .values().stream().map(rows -> directoryProfile(rows, assignments, activeIds))
            .sorted(Comparator.comparing(p -> p.profile().googleEmail())).toList();
        return new DirectoryView(profiles, teams, activeIds);
    }

    private void addImportedName(Map<String, Set<String>> names, String team, String name) {
        if (team != null && !team.isBlank() && name != null && !name.isBlank())
            names.computeIfAbsent(normalize(team), key -> new TreeSet<>()).add(name.trim());
    }

    private DirectoryProfile directoryProfile(List<StaffRoleAssignment> rows, List<AdviserTeamAssignment> assignments, List<UUID> activeIds) {
        var subjects = rows.stream().map(StaffRoleAssignment::getGoogleSubject).collect(Collectors.toSet());
        return new DirectoryProfile(profile(rows, assignments), assignments.stream()
            .filter(a -> subjects.contains(a.getGoogleSubject()) && activeIds.contains(a.getWorkspaceId()))
            .map(a -> new Assignment(a.getWorkspaceId(), a.getTeamCode())).distinct().toList());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> myAssignments(String subject) {
        var rows = roleRepository.findByGoogleSubjectAndEnabledTrue(subject);
        var active = workspaces.findAllByOrderByActiveDescProgramAscCourseCodeAscAcademicYearDescSemesterAsc()
            .stream().filter(w -> w.isActive()).toList();
        var activeIds = active.stream().map(w -> w.getId()).toList();
        var assignments = rows.isEmpty() ? List.<Assignment>of() : directoryProfile(rows,
            teamRepository.findAllByGoogleSubject(subject), activeIds).assignments();
        return Map.of("adviserName", rows.stream().map(StaffRoleAssignment::getAdviserName)
            .filter(Objects::nonNull).filter(name -> !name.isBlank()).findFirst().orElse(""),
            "assignments", assignments, "workspaces", active.stream()
                .filter(w -> assignments.stream().anyMatch(a -> a.workspaceId().equals(w.getId())))
                .map(com.capvault.backend.workspace.AcademicWorkspaceResponse::from).toList());
    }

    @Transactional
    public DirectoryProfile saveDirectory(DirectorySave request) {
        directory.lockDirectory();
        var view = staffDirectory();
        if (request.workspaceIds() == null || !new HashSet<>(view.workspaceIds()).equals(new HashSet<>(request.workspaceIds())))
            throw conflict("Active workspaces changed. Reload the directory before saving.");
        var existing = view.profiles().stream().filter(p -> p.profile().googleEmail().equals(normalize(request.googleEmail()))).findFirst();
        if (!Objects.equals(existing.map(p -> p.profile().revision()).orElse(null), request.expectedRevision()))
            throw conflict("Staff access changed. Reload the directory and review your changes.");
        if (view.workspaceIds().isEmpty()) throw conflict("Create an active workspace before assigning staff.");
        var selected = Objects.requireNonNullElse(request.assignments(), List.<Assignment>of());
        if (selected.stream().anyMatch(a -> a == null || !view.workspaceIds().contains(a.workspaceId())))
            throw conflict("Assignments must belong to active workspaces.");
        // Each scoped save joins this transaction. Any conflict rolls back every workspace and role update.
        for (UUID workspaceId : view.workspaceIds()) {
            var current = listStaff(workspaceId).stream().filter(p -> p.googleEmail().equals(normalize(request.googleEmail()))).findFirst();
            var owners = new HashMap<String, String>();
            if (request.teamOwners() != null) request.teamOwners().forEach((key, value) -> {
                if (key.startsWith(workspaceId + "::")) owners.put(key.substring(38), value);
            });
            saveProfile(workspaceId, new SaveRequest(request.googleEmail(), request.role(), request.adviserName(),
                selected.stream().filter(a -> a.workspaceId().equals(workspaceId)).map(Assignment::teamCode).toList(),
                current.map(StaffProfileView::revision).orElse(null), owners, request.confirmTransfers(), request.reactivate()));
        }
        return staffDirectory().profiles().stream().filter(p -> p.profile().googleEmail().equals(normalize(request.googleEmail()))).findFirst().orElseThrow();
    }

    private static String canonicalSubject(List<StaffRoleAssignment> rows) {
        return rows.stream().map(StaffRoleAssignment::getGoogleSubject)
            .sorted(Comparator.comparing((String s) -> s.startsWith("pending:")).thenComparing(s -> s)).findFirst().orElseThrow();
    }
    private static String normalize(String text) { return Objects.requireNonNullElse(text, "").trim().toLowerCase(Locale.ROOT); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
