package com.capvault.backend.monitoring;

import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import com.capvault.backend.archive.ArchiveRecordRepository;

import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableResponse;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.project.ProjectMetadataResponse;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseService;
import com.capvault.backend.staff.StaffManagementService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.student.StudentRecordResponse;
import com.capvault.backend.tracker.TrackerCellRepository;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.tracker.TrackerColumnResponse;
import com.capvault.backend.tracker.TrackerRowRepository;
import com.capvault.backend.tracker.TrackerRowResponse;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/monitoring")
public class StaffMonitoringController {

    private final StudentAssociationSecurity security;
    private final StaffManagementService staffManagementService;
    private final StudentRecordRepository studentRepository;
    private final ProjectMetadataRepository projectRepository;
    private final TrackerColumnRepository columnRepository;
    private final TrackerRowRepository rowRepository;
    private final TrackerCellRepository cellRepository;
    private final DeliverableRepository deliverableRepository;
    private final FormResponseService responseService;
    private final ArchiveRecordRepository archiveRepository;
    private final com.capvault.backend.response.ReviewFeedbackService reviews;
    private final com.capvault.backend.filecheck.FileCheckService checks;

    public StaffMonitoringController(
        StudentAssociationSecurity security,
        StaffManagementService staffManagementService,
        StudentRecordRepository studentRepository,
        ProjectMetadataRepository projectRepository,
        TrackerColumnRepository columnRepository,
        TrackerRowRepository rowRepository,
        TrackerCellRepository cellRepository,
        DeliverableRepository deliverableRepository,
        FormResponseService responseService,
        ArchiveRecordRepository archiveRepository,
        com.capvault.backend.response.ReviewFeedbackService reviews,
        com.capvault.backend.filecheck.FileCheckService checks
    ) {
        this.security = security;
        this.staffManagementService = staffManagementService;
        this.studentRepository = studentRepository;
        this.projectRepository = projectRepository;
        this.columnRepository = columnRepository;
        this.rowRepository = rowRepository;
        this.cellRepository = cellRepository;
        this.deliverableRepository = deliverableRepository;
        this.responseService = responseService;
        this.archiveRepository = archiveRepository;
        this.reviews = reviews;
        this.checks = checks;
    }

    public record MonitoringResponse(
        boolean allTeams,
        List<String> teamCodes,
        List<StudentRecordResponse> students,
        List<ProjectMetadataResponse> projects,
        List<TrackerColumnResponse> trackerColumns,
        List<TrackerRowResponse> trackerRows,
        List<DeliverableResponse> deliverables,
        List<FormResponse> responses,
        List<UUID> archivedResponseIds,
        java.util.Map<UUID, java.util.Map<String, Object>> reviewStates,
        java.util.Map<String, com.capvault.backend.filecheck.FileCheckResponse> fileChecks
    ) {
    }

    @GetMapping
    @Transactional(readOnly = true)
    public MonitoringResponse monitoring(@RequestParam UUID workspaceId,
            @RequestParam(defaultValue = "false") boolean includeReviews, HttpServletRequest http) {
        var session = security.requireSession(http);
        Set<StaffRole> roles = security.activeRoles(http);
        boolean allTeams = roles.contains(StaffRole.ADMIN);
        List<String> teams;
        if (allTeams) {
            teams = List.of();
        } else if (roles.contains(StaffRole.ADVISER)) {
            teams = staffManagementService.assignedTeams(session.googleSubject(), workspaceId);
        } else {
            throw new AccessDeniedException("Staff authorization required.");
        }

        var responses = allTeams ? responseService.responsesForWorkspace(workspaceId)
            : responseService.responsesForTeams(workspaceId, teams);
        var visibleVersions = responses.stream().collect(Collectors.toMap(FormResponse::getId, FormResponse::getUpdatedAt));
        var archivedResponseIds = archiveRepository.findAllByWorkspaceIdOrderByArchivedAtDesc(workspaceId).stream()
            .filter(record -> record.getSourceResponseUpdatedAt().equals(visibleVersions.get(record.getResponseId())))
            .map(record -> record.getResponseId()).distinct().toList();
        var rows = rowRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId).stream()
            .filter(row -> allTeams || containsTeam(teams, row.getTeamCode())).toList();
        var cells = rows.isEmpty() ? java.util.Map.<UUID, List<com.capvault.backend.tracker.TrackerCell>>of()
            : cellRepository.findAllByTrackerRowIdIn(rows.stream().map(row -> row.getId()).toList()).stream()
                .collect(Collectors.groupingBy(cell -> cell.getTrackerRow().getId()));
        return new MonitoringResponse(
            allTeams,
            teams,
            studentRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId).stream()
                .filter(student -> allTeams || containsTeam(teams, student.getTeamCode()))
                .map(StudentRecordResponse::from)
                .toList(),
            projectRepository.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId).stream()
                .filter(project -> allTeams || containsTeam(teams, project.getGroupCode()))
                .map(ProjectMetadataResponse::from)
                .toList(),
            columnRepository.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).stream()
                .map(TrackerColumnResponse::from)
                .toList(),
            rows.stream()
                .map(row -> TrackerRowResponse.from(row, cells.getOrDefault(row.getId(), List.of()).stream()
                    .sorted(Comparator.comparing(cell -> cell.getTrackerColumn().getDisplayOrder()))
                    .toList()))
                .toList(),
            deliverableRepository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId).stream()
                .map(DeliverableResponse::from)
                .toList(),
            responses,
            archivedResponseIds,
            includeReviews ? reviews.statesFor(responses.stream().map(FormResponse::getId).toList()) : java.util.Map.of(),
            includeReviews ? checks.latestForResponses(workspaceId, responses.stream().map(r -> r.getId().toString()).toList()) : java.util.Map.of()
        );
    }

    private static boolean containsTeam(List<String> teams, String teamCode) {
        return teams.stream().anyMatch(team -> team.equalsIgnoreCase(String.valueOf(teamCode)));
    }
}
