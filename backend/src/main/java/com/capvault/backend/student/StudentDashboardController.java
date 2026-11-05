package com.capvault.backend.student;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.capvault.backend.deliverable.DeliverableResponse;
import com.capvault.backend.deliverable.DeliverableService;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.filecheck.FileCheckResponse;
import com.capvault.backend.filecheck.FileCheckService;
import com.capvault.backend.filecheck.ObservedFileHistoryService;
import com.capvault.backend.filecheck.ObservedFileHistoryView.StudentHistory;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.project.ProjectMetadataResponse;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseController.ScopedResponse;
import com.capvault.backend.response.FormResponseService;
import com.capvault.backend.response.ResponseTimingService;
import com.capvault.backend.response.ResponseTimingView;
import com.capvault.backend.response.ReviewFeedbackService;
import com.capvault.backend.tracker.TrackerCellRepository;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.tracker.TrackerColumnResponse;
import com.capvault.backend.tracker.TrackerRowRepository;
import com.capvault.backend.tracker.TrackerRowResponse;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A student view is always account-scoped, including when the account also holds staff roles. */
@RestController
public class StudentDashboardController {
    private final StudentAssociationSecurity security;
    private final StudentAssociationService associations;
    private final AcademicWorkspaceRepository workspaces;
    private final StudentRecordRepository students;
    private final ProjectMetadataRepository projects;
    private final TrackerColumnRepository columns;
    private final TrackerRowRepository rows;
    private final TrackerCellRepository cells;
    private final DeliverableService deliverables;
    private final FormResponseService responses;
    private final ResponseTimingService responseTimings;
    private final ReviewFeedbackService reviews;
    private final FileCheckService checks;
    private final ObservedFileHistoryService fileHistory;

    public StudentDashboardController(StudentAssociationSecurity security, StudentAssociationService associations,
            AcademicWorkspaceRepository workspaces, StudentRecordRepository students, ProjectMetadataRepository projects,
            TrackerColumnRepository columns, TrackerRowRepository rows, TrackerCellRepository cells,
            DeliverableService deliverables, FormResponseService responses, ResponseTimingService responseTimings, ReviewFeedbackService reviews,
            FileCheckService checks, ObservedFileHistoryService fileHistory) {
        this.security = security;
        this.associations = associations;
        this.workspaces = workspaces;
        this.students = students;
        this.projects = projects;
        this.columns = columns;
        this.rows = rows;
        this.cells = cells;
        this.deliverables = deliverables;
        this.responses = responses;
        this.responseTimings = responseTimings;
        this.reviews = reviews;
        this.checks = checks;
        this.fileHistory = fileHistory;
    }

    public record DashboardResponse(StudentAssociationService.AssociationView association,
            List<StudentRecordResponse> rosterOptions, List<StudentRecordResponse> students,
            List<ProjectMetadataResponse> projects, List<TrackerColumnResponse> trackerColumns,
            List<TrackerRowResponse> trackerRows, List<DeliverableResponse> deliverables,
            List<ScopedResponse> responses, Map<UUID, ResponseTimingView> responseTimings,
            Map<UUID, Map<String, Object>> reviewStates,
            Map<UUID, FileCheckResponse> fileChecks,
            Map<UUID, Map<String, FileCheckResponse>> fileChecksByField,
            Map<String, StudentHistory> observedFileHistory,
            Map<String, Map<String, StudentHistory>> observedFileHistoryByField) { }

    @GetMapping("/api/workspace/students/dashboard")
    @Transactional(readOnly = true)
    public DashboardResponse dashboard(@RequestParam UUID workspaceId, HttpServletRequest http) {
        var session = security.requireSession(http);
        workspaces.findById(workspaceId).orElseThrow(() -> new IllegalArgumentException("Workspace not found."));
        var association = associations.activeAssociation(workspaceId, session.googleSubject()).orElse(null);
        if (association == null) {
            throw new org.springframework.security.access.AccessDeniedException("No student access to this workspace.");
        }
        String team = association == null ? "" : association.teamCode();
        Map<UUID, FormResponse> visible = new LinkedHashMap<>();
        if (team != null && !team.isBlank()) {
            responses.responsesForTeams(workspaceId, List.of(team)).forEach(item -> visible.put(item.getId(), item));
        }
        var owned = association == null
            ? List.<FormResponse>of()
            : responses.responsesForSubject(workspaceId, session.googleSubject());
        var submittedDeliverables = owned.stream().map(FormResponse::getDeliverableId).collect(Collectors.toSet());
        owned.forEach(item -> visible.put(item.getId(), item));
        Map<UUID, Map<String, Object>> reviewStates = new LinkedHashMap<>();
        Map<UUID, FileCheckResponse> fileChecks = new LinkedHashMap<>();
        for (var response : owned) {
            reviewStates.put(response.getId(), reviews.studentStateFor(response.getId(), response.getUpdatedAt()));
            checks.findLatest(workspaceId, response.getId().toString())
                .ifPresent(report -> fileChecks.put(response.getId(), report));
        }
        var ownedIds = owned.stream().map(item -> item.getId().toString()).toList();
        var histories = fileHistory.forStudentResponses(workspaceId, ownedIds);
        Map<UUID, Map<String, FileCheckResponse>> fieldChecks = new LinkedHashMap<>();
        checks.latestByFieldForResponses(workspaceId, ownedIds)
            .forEach((responseId, reports) -> {
                try { fieldChecks.put(UUID.fromString(responseId), reports); }
                catch (IllegalArgumentException ignored) { }
            });
        return new DashboardResponse(association, associations.workspaceRosterOptions(workspaceId).stream()
                .filter(item -> item.id().equals(association.studentRecordId())).toList(),
            students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId).stream()
                .filter(com.capvault.backend.student.StudentRecord::isCurrentActive)
                .filter(item -> sameTeam(team, item.getTeamCode())).map(StudentRecordResponse::from).toList(),
            projects.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId).stream()
                .filter(item -> sameTeam(team, item.getEffectiveGroupCode())).map(ProjectMetadataResponse::from).toList(),
            columns.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).stream()
                .map(TrackerColumnResponse::from).toList(),
            rows.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId).stream()
                .filter(item -> sameTeam(team, item.getTeamCode()))
                .map(item -> TrackerRowResponse.from(item, cells.findAllByTrackerRowId(item.getId()).stream()
                    // Tracker marks are shared context, not an alternate route to submitted links.
                    .filter(cell -> cell.getRawValue() == null || !cell.getRawValue().toLowerCase(java.util.Locale.ROOT).contains("http"))
                    .toList())).toList(),
            deliverables.listDeliverables(workspaceId).stream()
                .filter(item -> item.status() == DeliverableStatus.PUBLISHED || submittedDeliverables.contains(item.id()))
                .toList(),
            visible.values().stream().map(item -> ScopedResponse.from(item, session.googleSubject().equals(item.getGoogleSubject()))).toList(),
            responseTimings.forResponses(owned),
            reviewStates, fileChecks, fieldChecks, histories.legacy(), histories.byField());
    }

    private static boolean sameTeam(String expected, String actual) {
        return expected != null && !expected.isBlank() && expected.equalsIgnoreCase(actual);
    }
}
