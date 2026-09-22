package com.capvault.backend.academic;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableRequest;
import com.capvault.backend.deliverable.DeliverableResponse;
import com.capvault.backend.deliverable.DeliverableService;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.project.ProjectMetadata;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.project.ProjectMetadataResponse;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.student.StudentRecordResponse;
import com.capvault.backend.tracker.TrackerColumn;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.tracker.TrackerColumnResponse;
import com.capvault.backend.workspace.AcademicWorkspace;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AcademicDataService {

    public record Snapshot(
        List<StudentRecordResponse> students,
        List<ProjectMetadataResponse> projects,
        List<DeliverableResponse> deliverables,
        List<TrackerColumnResponse> trackerColumns
    ) {
    }

    public record StudentEdit(
        UUID id,
        String studentNumber,
        String studentName,
        String teamCode,
        String memberNumber,
        String sectionName,
        String adviserName,
        String institutionalEmail,
        LocalDateTime expectedUpdatedAt
    ) {
    }

    public record StudentBatch(List<StudentEdit> rows) {
    }

    public record ProjectEdit(
        UUID id,
        String groupCode,
        String projectTitle,
        String softwareName,
        String description,
        String proposalRemarks,
        String demoComments,
        String adviserName,
        String projectStatus,
        String category,
        LocalDateTime expectedUpdatedAt
    ) {
    }

    public record ProjectBatch(List<ProjectEdit> rows) {
    }

    public record DeliverableEdit(
        UUID id,
        String trackerColumnKey,
        String title,
        LocalDateTime dueAt,
        DeliverableStatus status,
        LocalDateTime expectedUpdatedAt
    ) {
    }

    public record DeliverableBatch(List<DeliverableEdit> rows) {
    }

    private final EntityManager entityManager;
    private final StudentRecordRepository students;
    private final ProjectMetadataRepository projects;
    private final DeliverableRepository deliverables;
    private final TrackerColumnRepository trackerColumns;
    private final DeliverableService deliverableService;

    public AcademicDataService(
        EntityManager entityManager,
        StudentRecordRepository students,
        ProjectMetadataRepository projects,
        DeliverableRepository deliverables,
        TrackerColumnRepository trackerColumns,
        DeliverableService deliverableService
    ) {
        this.entityManager = entityManager;
        this.students = students;
        this.projects = projects;
        this.deliverables = deliverables;
        this.trackerColumns = trackerColumns;
        this.deliverableService = deliverableService;
    }

    @Transactional(readOnly = true)
    public Snapshot snapshot(UUID workspaceId) {
        requireWorkspace(workspaceId, LockModeType.NONE);
        return new Snapshot(
            students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId).stream()
                .filter(StudentRecord::isCurrentActive)
                .map(StudentRecordResponse::from)
                .toList(),
            projects.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId).stream()
                .map(ProjectMetadataResponse::from)
                .toList(),
            deliverableService.listDeliverables(workspaceId),
            trackerColumns.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).stream()
                .map(TrackerColumnResponse::from)
                .toList()
        );
    }

    @Transactional
    public List<StudentRecordResponse> saveStudents(UUID workspaceId, StudentBatch batch) {
        requireWorkspace(workspaceId, LockModeType.PESSIMISTIC_WRITE);
        List<StudentEdit> rows = safeRows(batch == null ? null : batch.rows());
        if (rows.isEmpty()) return List.of();

        List<StudentRecord> all = students.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId);
        Set<UUID> editedIds = new HashSet<>();
        Map<UUID, StudentRecord> locked = new HashMap<>();
        for (StudentEdit row : rows) {
            validateStudent(row);
            if (row.id() == null) continue;
            if (!editedIds.add(row.id())) throw new IllegalArgumentException("A student row can only be saved once per batch.");
            StudentRecord current = entityManager.find(StudentRecord.class, row.id(), LockModeType.PESSIMISTIC_WRITE);
            if (current == null || !workspaceId.equals(current.getWorkspaceId())) {
                throw new IllegalArgumentException("Student row was not found in this workspace.");
            }
            requireFresh(row.expectedUpdatedAt(), current.getUpdatedAt(), "student row");
            locked.put(row.id(), current);
        }
        Set<String> numbers = new HashSet<>();
        for (StudentRecord current : all) {
            if (current.getId() != null && editedIds.contains(current.getId())) continue;
            String number = key(current.getStudentNumber());
            if (!number.isBlank()) numbers.add(number);
        }
        for (StudentEdit row : rows) {
            if (!numbers.add(key(row.studentNumber()))) {
                throw new IllegalArgumentException("Student Number must be unique within this workspace.");
            }
        }

        List<StudentRecord> changed = new ArrayList<>();
        for (StudentEdit row : rows) {
            StudentRecord current = row.id() == null
                ? new StudentRecord(
                    workspaceId,
                    row.studentNumber().trim(),
                    row.studentName().trim(),
                    row.teamCode().trim(),
                    null,
                    clean(row.memberNumber()),
                    clean(row.sectionName()),
                    clean(row.adviserName()),
                    clean(row.institutionalEmail()),
                    null,
                    null)
                : locked.get(row.id());
            if (row.id() != null) {
                current.updateFrom(
                    row.studentNumber().trim(),
                    row.studentName().trim(),
                    row.teamCode().trim(),
                    clean(row.memberNumber()),
                    clean(row.sectionName()),
                    clean(row.adviserName()),
                    clean(row.institutionalEmail()),
                    current.getSourceRowNumber());
            }
            changed.add(current);
        }
        students.saveAllAndFlush(changed);
        changed.forEach(entityManager::refresh);
        return changed.stream().map(StudentRecordResponse::from).toList();
    }

    @Transactional
    public List<ProjectMetadataResponse> saveProjects(UUID workspaceId, ProjectBatch batch) {
        requireWorkspace(workspaceId, LockModeType.PESSIMISTIC_WRITE);
        List<ProjectEdit> rows = safeRows(batch == null ? null : batch.rows());
        if (rows.isEmpty()) return List.of();

        List<ProjectMetadata> all = projects.findAllByWorkspaceIdOrderByGroupCodeAsc(workspaceId);
        Set<UUID> editedIds = new HashSet<>();
        Map<UUID, ProjectMetadata> locked = new HashMap<>();
        for (ProjectEdit row : rows) {
            validateProject(row);
            if (row.id() == null) continue;
            if (!editedIds.add(row.id())) throw new IllegalArgumentException("A project row can only be saved once per batch.");
            ProjectMetadata current = entityManager.find(ProjectMetadata.class, row.id(), LockModeType.PESSIMISTIC_WRITE);
            if (current == null || !workspaceId.equals(current.getWorkspaceId())) {
                throw new IllegalArgumentException("Project row was not found in this workspace.");
            }
            requireFresh(row.expectedUpdatedAt(), current.getUpdatedAt(), "project row");
            locked.put(row.id(), current);
        }
        Set<String> groups = new HashSet<>();
        for (ProjectMetadata current : all) {
            if (current.getId() != null && editedIds.contains(current.getId())) continue;
            groups.add(key(current.getEffectiveGroupCode()));
        }
        for (ProjectEdit row : rows) {
            if (!groups.add(key(row.groupCode()))) {
                throw new IllegalArgumentException("Team code must be unique within project rows.");
            }
        }

        List<ProjectMetadata> changed = new ArrayList<>();
        for (ProjectEdit row : rows) {
            ProjectMetadata current = row.id() == null
                ? new ProjectMetadata(
                    workspaceId,
                    row.groupCode().trim(),
                    clean(row.projectTitle()),
                    clean(row.softwareName()),
                    clean(row.description()),
                    clean(row.proposalRemarks()),
                    clean(row.demoComments()),
                    clean(row.adviserName()),
                    clean(row.projectStatus()),
                    clean(row.category()),
                    null)
                : locked.get(row.id());
            if (row.id() != null) {
                current.updateFrom(
                    current.getGroupCode(),
                    clean(row.projectTitle()),
                    current.getSoftwareName(),
                    clean(row.description()),
                    clean(row.proposalRemarks()),
                    clean(row.demoComments()),
                    current.getAdviserName(),
                    clean(row.projectStatus()),
                    clean(row.category()),
                    current.getSourceRowNumber());
                current.applyCurrentTrackerContext(
                    row.groupCode().trim(),
                    clean(row.softwareName()),
                    clean(row.adviserName()));
            }
            changed.add(current);
        }
        projects.saveAllAndFlush(changed);
        changed.forEach(entityManager::refresh);
        return changed.stream().map(ProjectMetadataResponse::from).toList();
    }

    @Transactional
    public List<DeliverableResponse> saveDeliverables(UUID workspaceId, DeliverableBatch batch) {
        requireWorkspace(workspaceId, LockModeType.PESSIMISTIC_WRITE);
        List<DeliverableEdit> rows = safeRows(batch == null ? null : batch.rows());
        if (rows.isEmpty()) return List.of();

        List<Deliverable> all = deliverables.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId);
        Set<UUID> editedIds = new HashSet<>();
        Map<UUID, Deliverable> locked = new HashMap<>();
        Map<String, TrackerColumn> columnsByKey = trackerColumns.findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(workspaceId).stream()
            .collect(java.util.stream.Collectors.toMap(column -> key(column.getColumnKey()), column -> column, (first, second) -> first));
        for (DeliverableEdit row : rows) {
            validateDeliverable(row);
            if (!columnsByKey.containsKey(key(row.trackerColumnKey()))) {
                throw new IllegalArgumentException("Choose a deliverable column that exists in this workspace.");
            }
            if (row.id() == null) continue;
            if (!editedIds.add(row.id())) throw new IllegalArgumentException("A deliverable row can only be saved once per batch.");
            Deliverable current = entityManager.find(Deliverable.class, row.id(), LockModeType.PESSIMISTIC_WRITE);
            if (current == null || !workspaceId.equals(current.getWorkspaceId())) {
                throw new IllegalArgumentException("Deliverable row was not found in this workspace.");
            }
            requireFresh(row.expectedUpdatedAt(), current.getUpdatedAt(), "deliverable row");
            if (!key(current.getTrackerColumnKey()).equals(key(row.trackerColumnKey()))) {
                throw new IllegalArgumentException("An existing deliverable cannot be moved to a different tracker column.");
            }
            locked.put(row.id(), current);
        }
        Set<String> keys = new HashSet<>();
        for (Deliverable current : all) {
            if (current.getId() != null && editedIds.contains(current.getId())) continue;
            keys.add(key(current.getTrackerColumnKey()));
        }
        for (DeliverableEdit row : rows) {
            if (!keys.add(key(row.trackerColumnKey()))) {
                throw new IllegalArgumentException("Each tracker column can only have one deliverable form.");
            }
        }

        List<DeliverableResponse> changed = new ArrayList<>();
        for (DeliverableEdit row : rows) {
            if (row.id() == null) {
                TrackerColumn column = columnsByKey.get(key(row.trackerColumnKey()));
                changed.add(deliverableService.createDeliverable(workspaceId, new DeliverableRequest(
                    row.trackerColumnKey().trim(),
                    row.title().trim(),
                    null,
                    "",
                    row.dueAt(),
                    Boolean.TRUE.equals(column.getPdfRequired()),
                    row.status(),
                    null)));
                continue;
            }
            Deliverable current = locked.get(row.id());
            changed.add(deliverableService.updateDeliverable(workspaceId, current.getId(), new DeliverableRequest(
                current.getTrackerColumnKey(),
                row.title().trim(),
                current.getSlug(),
                current.getInstructions(),
                row.dueAt(),
                current.isPdfRequired(),
                row.status(),
                null,
                row.expectedUpdatedAt())));
        }
        return changed;
    }

    /** Explicit Admin deletion is limited to unreferenced rows; submitted academic
     *  history/account bindings and published forms cannot be silently destroyed. */
    @Transactional
    public void deleteRow(UUID workspaceId, String kind, UUID rowId, LocalDateTime expectedUpdatedAt) {
        if (workspaceId == null || rowId == null) throw new IllegalArgumentException("Select a row in the active workspace.");
        requireWorkspace(workspaceId, LockModeType.PESSIMISTIC_WRITE);
        switch (kind) {
            case "students" -> {
                StudentRecord row = entityManager.find(StudentRecord.class, rowId, LockModeType.PESSIMISTIC_WRITE);
                if (row == null || !workspaceId.equals(row.getWorkspaceId())) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Student row was not found in this workspace.");
                }
                requireFresh(expectedUpdatedAt, row.getUpdatedAt(), "student row");
                if (referenced("form_responses", "student_record_id", workspaceId, rowId)
                    || referenced("workspace_student_associations", "student_record_id", workspaceId, rowId)
                    || referenced("student_identity_conflicts", "student_record_id", workspaceId, rowId)
                    || referenced("canonical_response_selections", "student_record_id", workspaceId, rowId)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This student has saved submission or account history and cannot be deleted from Academic Data.");
                }
                entityManager.remove(row);
            }
            case "projects" -> {
                ProjectMetadata row = entityManager.find(ProjectMetadata.class, rowId, LockModeType.PESSIMISTIC_WRITE);
                if (row == null || !workspaceId.equals(row.getWorkspaceId())) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Project row was not found in this workspace.");
                }
                requireFresh(expectedUpdatedAt, row.getUpdatedAt(), "project row");
                if (count("SELECT COUNT(*) FROM form_responses WHERE workspace_id = ? AND LOWER(team_code) IN (?, ?)",
                    workspaceId, key(row.getGroupCode()), key(row.getEffectiveGroupCode())) > 0) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This team has saved submissions. Keep its project record for historical review.");
                }
                entityManager.remove(row);
            }
            case "deliverables" -> {
                Deliverable row = entityManager.find(Deliverable.class, rowId, LockModeType.PESSIMISTIC_WRITE);
                if (row == null || !workspaceId.equals(row.getWorkspaceId())) {
                    throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deliverable row was not found in this workspace.");
                }
                requireFresh(expectedUpdatedAt, row.getUpdatedAt(), "deliverable row");
                if (row.getStatus() != DeliverableStatus.UNPUBLISHED
                    || referenced("form_responses", "deliverable_id", workspaceId, rowId)
                    || referenced("form_response_drafts", "deliverable_id", workspaceId, rowId)
                    || referenced("academic_tracker_writebacks", "deliverable_id", workspaceId, rowId)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This deliverable is published or has saved responses, drafts, or tracker history. Unpublish or retain its academic record.");
                }
                // Selection is configuration, not submission evidence: remove an
                // opted-in row before deleting an otherwise unused deliverable.
                entityManager.createNativeQuery("DELETE FROM workspace_file_monitor_deliverables WHERE workspace_id=? AND deliverable_id=?")
                    .setParameter(1, workspaceId).setParameter(2, rowId).executeUpdate();
                entityManager.remove(row);
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose students, projects, or deliverables.");
        }
        entityManager.flush();
    }

    private boolean referenced(String table, String column, UUID workspaceId, UUID rowId) {
        return count("SELECT COUNT(*) FROM " + table + " WHERE workspace_id = ? AND " + column + " = ?",
            workspaceId, rowId) > 0;
    }

    private long count(String query, Object... args) {
        var sql = entityManager.createNativeQuery(query);
        for (int i = 0; i < args.length; i++) sql.setParameter(i + 1, args[i]);
        return ((Number) sql.getSingleResult()).longValue();
    }

    private AcademicWorkspace requireWorkspace(UUID workspaceId, LockModeType mode) {
        AcademicWorkspace workspace = entityManager.find(AcademicWorkspace.class, workspaceId, mode);
        if (workspace == null) throw new IllegalArgumentException("Academic workspace was not found.");
        return workspace;
    }

    private static void requireFresh(LocalDateTime expected, LocalDateTime actual, String label) {
        if (expected == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Reload before saving this " + label + ".");
        }
        if (!expected.equals(actual)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This " + label + " changed after you opened it. Reload before saving.");
        }
    }

    private static void validateStudent(StudentEdit row) {
        if (row == null) throw new IllegalArgumentException("Student rows cannot be empty.");
        required(row.studentNumber(), "Student Number", 80);
        required(row.studentName(), "Student name", 240);
        required(row.teamCode(), "Team code", 160);
        max(row.memberNumber(), "Member number", 40);
        max(row.sectionName(), "Section", 120);
        max(row.adviserName(), "Adviser", 200);
        max(row.institutionalEmail(), "Institutional email", 240);
    }

    private static void validateProject(ProjectEdit row) {
        if (row == null) throw new IllegalArgumentException("Project rows cannot be empty.");
        required(row.groupCode(), "Team code", 160);
        max(row.projectTitle(), "Project title", 1000);
        max(row.softwareName(), "Software name", 500);
        max(row.adviserName(), "Adviser", 240);
        max(row.projectStatus(), "Project status", 240);
        max(row.category(), "Category", 240);
    }

    private static void validateDeliverable(DeliverableEdit row) {
        if (row == null) throw new IllegalArgumentException("Deliverable rows cannot be empty.");
        required(row.trackerColumnKey(), "Tracker column", 160);
        required(row.title(), "Deliverable title", 240);
        if (row.dueAt() == null) throw new IllegalArgumentException("Deliverable due date is required.");
        if (row.status() == null) throw new IllegalArgumentException("Deliverable status is required.");
    }

    private static void required(String value, String label, int max) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(label + " is required.");
        max(value, label, max);
    }

    private static void max(String value, String label, int max) {
        if (value != null && value.trim().length() > max) throw new IllegalArgumentException(label + " is too long.");
    }

    private static String clean(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String key(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static <T> List<T> safeRows(List<T> rows) {
        return rows == null ? List.of() : rows;
    }
}
