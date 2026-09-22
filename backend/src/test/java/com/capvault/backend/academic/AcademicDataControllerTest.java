package com.capvault.backend.academic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.project.ProjectMetadata;
import com.capvault.backend.project.ProjectMetadataRepository;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.tracker.TrackerColumn;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.Cookie;
import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AcademicDataControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired WildTrackSessionService sessions;
    @Autowired StaffRoleAssignmentRepository staffRoles;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentRecordRepository students;
    @Autowired ProjectMetadataRepository projects;
    @Autowired TrackerColumnRepository trackerColumns;
    @Autowired DeliverableRepository deliverables;
    @Autowired EntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    @Test
    void adminCanLoadImportedRowsWhileOrdinaryUserCannotOpenAcademicGrid() throws Exception {
        AcademicWorkspace workspace = workspace("snapshot");
        students.saveAndFlush(new StudentRecord(
            workspace.getId(), "26-0001", "Imported Student", "TEAM-01", "1", "G7", "Adviser", "student@cit.edu", 12));
        projects.saveAndFlush(new ProjectMetadata(
            workspace.getId(), "TEAM-01", "WildTrack", "WildTrack", "Desc", "Approved", "Demo", "Adviser", "Active", "Capstone", 7));
        trackerColumns.saveAndFlush(new TrackerColumn(workspace.getId(), "SRS", "Refactored SRS", "Refactored SRS", 1, 0, true, true));
        deliverables.saveAndFlush(new Deliverable(
            workspace.getId(), "SRS", "Refactored SRS", "refactored-srs", "Submit SRS", LocalDateTime.of(2026, 9, 19, 23, 59), true, DeliverableStatus.UNPUBLISHED));

        mockMvc.perform(get("/api/academic-data")
                .param("workspaceId", workspace.getId().toString())
                .cookie(adminCookie("academic-grid-admin")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.students[0].studentNumber").value("26-0001"))
            .andExpect(jsonPath("$.students[0].sourceRowNumber").value(12))
            .andExpect(jsonPath("$.projects[0].sourceGroupCode").value("TEAM-01"))
            .andExpect(jsonPath("$.deliverables[0].trackerColumnKey").value("SRS"));

        mockMvc.perform(get("/api/academic-data")
                .param("workspaceId", workspace.getId().toString())
                .cookie(userCookie("academic-grid-student")))
            .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/academic-data/students")
                .param("workspaceId", workspace.getId().toString())
                .cookie(userCookie("academic-grid-write-student")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"rows\":[]}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void multirowStudentSaveIsAtomicAndStaleRowsReturnConflict() throws Exception {
        AcademicWorkspace workspace = workspace("atomic");
        StudentRecord first = students.saveAndFlush(new StudentRecord(
            workspace.getId(), "26-1001", "First", "TEAM-01", "1", "G7", null, null, 1));
        StudentRecord second = students.saveAndFlush(new StudentRecord(
            workspace.getId(), "26-1002", "Second", "TEAM-02", "1", "G7", null, null, 2));
        entityManager.clear();
        first = students.findById(first.getId()).orElseThrow();
        second = students.findById(second.getId()).orElseThrow();
        Cookie admin = adminCookie("academic-atomic-admin");

        String invalid = objectMapper.writeValueAsString(Map.of("rows", List.of(
            studentRow(first, "26-1001", "Edited First", "TEAM-01"),
            studentRow(second, "26-1001", "Edited Second", "TEAM-02")
        )));
        mockMvc.perform(put("/api/academic-data/students")
                .param("workspaceId", workspace.getId().toString())
                .cookie(admin).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(invalid))
            .andExpect(status().isBadRequest());

        assertThat(students.findById(first.getId()).orElseThrow().getStudentName()).isEqualTo("First");
        assertThat(students.findById(second.getId()).orElseThrow().getStudentName()).isEqualTo("Second");

        LocalDateTime staleVersion = first.getUpdatedAt();
        StudentRecord concurrent = students.findById(first.getId()).orElseThrow();
        concurrent.updateFrom("26-1001", "Concurrent edit", "TEAM-01", "1", "G7", null, null, concurrent.getSourceRowNumber());
        students.saveAndFlush(concurrent);
        entityManager.clear();

        String stale = objectMapper.writeValueAsString(Map.of("rows", List.of(Map.of(
            "id", first.getId().toString(),
            "studentNumber", "26-1001",
            "studentName", "Stale overwrite",
            "teamCode", "TEAM-01",
            "memberNumber", "1",
            "sectionName", "G7",
            "adviserName", "",
            "institutionalEmail", "",
            "expectedUpdatedAt", staleVersion.toString()
        ))));
        mockMvc.perform(put("/api/academic-data/students")
                .param("workspaceId", workspace.getId().toString())
                .cookie(admin).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(stale))
            .andExpect(status().isConflict());

        assertThat(students.findById(first.getId()).orElseThrow().getStudentName()).isEqualTo("Concurrent edit");
    }

    @Test
    void studentAndProjectEditsKeepImportedProvenanceAndDeliverableSaveKeepsStableMapping() throws Exception {
        AcademicWorkspace workspace = workspace("persistence");
        StudentRecord student = students.saveAndFlush(new StudentRecord(
            workspace.getId(), "26-2001", "Student", "SOURCE-TEAM", "1", "G7", "Old adviser", null, 41));
        student.updateFromTracker("26-2001", "Student", "CURRENT-TEAM", "1", "G7", "Old adviser", "WildTrack", 99);
        student = students.saveAndFlush(student);
        ProjectMetadata project = projects.saveAndFlush(new ProjectMetadata(
            workspace.getId(), "SOURCE-TEAM", "Original title", "Old software", "Desc", "Remark", "Demo", "Old adviser", "Active", "Capstone", 22));
        project.applyCurrentTrackerContext("CURRENT-TEAM", "Current software", "Current adviser");
        project = projects.saveAndFlush(project);
        TrackerColumn srs = trackerColumns.saveAndFlush(new TrackerColumn(workspace.getId(), "Refactored SRS", "Refactored SRS", "Refactored SRS", 4, 0, true, true));
        Deliverable deliverable = deliverables.saveAndFlush(new Deliverable(
            workspace.getId(), srs.getColumnKey(), "Refactored SRS", "refactored-srs", "Keep instructions", LocalDateTime.of(2026, 9, 19, 23, 59), true, DeliverableStatus.PUBLISHED));
        entityManager.clear();
        student = students.findById(student.getId()).orElseThrow();
        project = projects.findById(project.getId()).orElseThrow();
        deliverable = deliverables.findById(deliverable.getId()).orElseThrow();
        Cookie admin = adminCookie("academic-persistence-admin");

        mockMvc.perform(put("/api/academic-data/students")
                .param("workspaceId", workspace.getId().toString()).cookie(admin).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("rows", List.of(Map.of(
                    "id", student.getId().toString(), "studentNumber", "26-2001", "studentName", "Edited Student",
                    "teamCode", "MANUAL-TEAM", "memberNumber", "2", "sectionName", "G8", "adviserName", "New adviser",
                    "institutionalEmail", "student@cit.edu", "expectedUpdatedAt", student.getUpdatedAt().toString()
                ))))))
            .andExpect(status().isOk());
        StudentRecord savedStudent = students.findById(student.getId()).orElseThrow();
        assertThat(savedStudent.getTeamCode()).isEqualTo("MANUAL-TEAM");
        assertThat(savedStudent.getTeamFormationCode()).isEqualTo("SOURCE-TEAM");
        assertThat(savedStudent.getSourceRowNumber()).isEqualTo(99);

        mockMvc.perform(put("/api/academic-data/projects")
                .param("workspaceId", workspace.getId().toString()).cookie(admin).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("rows", List.of(Map.ofEntries(
                    Map.entry("id", project.getId().toString()),
                    Map.entry("groupCode", "MANUAL-TEAM"),
                    Map.entry("projectTitle", "Edited title"),
                    Map.entry("softwareName", "Edited software"),
                    Map.entry("description", "Edited description"),
                    Map.entry("proposalRemarks", "Keep"),
                    Map.entry("demoComments", "Good"),
                    Map.entry("adviserName", "New adviser"),
                    Map.entry("projectStatus", "Active"),
                    Map.entry("category", "Capstone"),
                    Map.entry("expectedUpdatedAt", project.getUpdatedAt().toString())
                ))))))
            .andExpect(status().isOk());
        ProjectMetadata savedProject = projects.findById(project.getId()).orElseThrow();
        assertThat(savedProject.getEffectiveGroupCode()).isEqualTo("MANUAL-TEAM");
        assertThat(savedProject.getGroupCode()).isEqualTo("SOURCE-TEAM");
        assertThat(savedProject.getSourceRowNumber()).isEqualTo(22);

        mockMvc.perform(put("/api/academic-data/deliverables")
                .param("workspaceId", workspace.getId().toString()).cookie(admin).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("rows", List.of(Map.of(
                    "id", deliverable.getId().toString(), "trackerColumnKey", "Refactored SRS", "title", "Refactored SRS Final",
                    "dueAt", "2026-09-20T23:59:00", "status", "UNPUBLISHED", "expectedUpdatedAt", deliverable.getUpdatedAt().toString()
                ))))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].slug").value("refactored-srs"))
            .andExpect(jsonPath("$[0].trackerColumnKey").value("Refactored SRS"));
        Deliverable savedDeliverable = deliverables.findById(deliverable.getId()).orElseThrow();
        assertThat(savedDeliverable.getTitle()).isEqualTo("Refactored SRS Final");
        assertThat(savedDeliverable.getSlug()).isEqualTo("refactored-srs");
        assertThat(savedDeliverable.getTrackerColumnKey()).isEqualTo("Refactored SRS");

        mockMvc.perform(get("/api/monitoring")
                .param("workspaceId", workspace.getId().toString())
                .cookie(admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.students[0].studentName").value("Edited Student"))
            .andExpect(jsonPath("$.students[0].teamCode").value("MANUAL-TEAM"))
            .andExpect(jsonPath("$.projects[0].projectTitle").value("Edited title"))
            .andExpect(jsonPath("$.projects[0].groupCode").value("MANUAL-TEAM"))
            .andExpect(jsonPath("$.deliverables[0].title").value("Refactored SRS Final"));
    }

    @Test
    void deleteIsAdminOnlyWorkspaceScopedVersionCheckedAndRemovesOnlyRequestedUnreferencedRow() throws Exception {
        AcademicWorkspace workspace = workspace("delete");
        AcademicWorkspace other = workspace("delete-other");
        StudentRecord student = students.saveAndFlush(new StudentRecord(
            workspace.getId(), "26-DEL-1", "Synthetic Student", "TEAM-DEL", "1", "G7", null, null, null));
        ProjectMetadata project = projects.saveAndFlush(new ProjectMetadata(
            workspace.getId(), "TEAM-DEL", "Synthetic project", "Sample", "", "", "", "", "", "", null));
        entityManager.clear();
        student = students.findById(student.getId()).orElseThrow();
        Cookie admin = adminCookie("academic-delete-admin");
        var target = "/api/academic-data/students/" + student.getId();
        var body = objectMapper.writeValueAsString(Map.of("expectedUpdatedAt", student.getUpdatedAt()));

        mockMvc.perform(delete(target).param("workspaceId", workspace.getId().toString())
            .cookie(userCookie("academic-delete-student")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mockMvc.perform(delete(target).param("workspaceId", other.getId().toString())
            .cookie(admin).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNotFound());
        mockMvc.perform(delete(target).param("workspaceId", workspace.getId().toString())
            .cookie(admin).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content("{\"expectedUpdatedAt\":\"2000-01-01T00:00:00\"}"))
            .andExpect(status().isConflict());
        assertThat(students.findById(student.getId())).isPresent();
        mockMvc.perform(delete(target).param("workspaceId", workspace.getId().toString())
            .cookie(admin).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        assertThat(students.findById(student.getId())).isEmpty();
        assertThat(projects.findById(project.getId())).isPresent();
    }

    @Test
    void cannotDeleteStudentOrDeliverableWithSavedSubmissionEvidence() throws Exception {
        AcademicWorkspace workspace = workspace("protected-delete");
        StudentRecord student = students.saveAndFlush(new StudentRecord(workspace.getId(),
            "26-DEL-2", "Protected Student", "TEAM-P", "1", "G7", null, null, null));
        Deliverable deliverable = deliverables.saveAndFlush(new Deliverable(workspace.getId(),
            "SRS-P", "Protected SRS", "protected-srs", "", LocalDateTime.of(2026, 9, 19, 23, 59),
            true, DeliverableStatus.UNPUBLISHED));
        jdbc.update("""
            INSERT INTO form_responses(id,workspace_id,deliverable_id,google_subject,google_email,
              student_record_id,student_number,student_name,team_code,values_json,revision,submitted_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
            """, UUID.randomUUID(), workspace.getId(), deliverable.getId(), "synthetic-protected-user",
            "protected@example.invalid", student.getId(), student.getStudentNumber(), student.getStudentName(),
            student.getTeamCode(), "{}");
        entityManager.clear();
        student = students.findById(student.getId()).orElseThrow();
        deliverable = deliverables.findById(deliverable.getId()).orElseThrow();
        Cookie admin = adminCookie("academic-protected-admin");
        for (var target : List.of(Map.entry("students", student.getId()),
            Map.entry("deliverables", deliverable.getId()))) {
            var updatedAt = target.getKey().equals("students") ? student.getUpdatedAt() : deliverable.getUpdatedAt();
            mockMvc.perform(delete("/api/academic-data/" + target.getKey() + "/" + target.getValue())
                .param("workspaceId", workspace.getId().toString()).cookie(admin).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("expectedUpdatedAt", updatedAt))))
                .andExpect(status().isConflict());
        }
        assertThat(students.findById(student.getId())).isPresent();
        assertThat(deliverables.findById(deliverable.getId())).isPresent();
    }

    @Test
    void unreferencedProjectAndUnpublishedDeliverableCanBeDeletedWithoutRemovingTrackerColumn() throws Exception {
        AcademicWorkspace workspace = workspace("delete-project-form");
        ProjectMetadata project = projects.saveAndFlush(new ProjectMetadata(workspace.getId(),
            "TEAM-UNLINKED", "Synthetic", "Sample", "", "", "", "", "", "", null));
        TrackerColumn tracker = trackerColumns.saveAndFlush(new TrackerColumn(workspace.getId(),
            "SRS-UNUSED", "Unused document", "Unused document", 2, 0, true, true));
        Deliverable deliverable = deliverables.saveAndFlush(new Deliverable(workspace.getId(),
            tracker.getColumnKey(), "Unused document", "unused-document", "", LocalDateTime.of(2099, 9, 19, 23, 59),
            true, DeliverableStatus.UNPUBLISHED));
        entityManager.clear();
        project = projects.findById(project.getId()).orElseThrow();
        deliverable = deliverables.findById(deliverable.getId()).orElseThrow();
        Cookie admin = adminCookie("academic-delete-unreferenced-admin");
        mockMvc.perform(delete("/api/academic-data/projects/" + project.getId())
            .param("workspaceId", workspace.getId().toString()).cookie(admin).with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("expectedUpdatedAt", project.getUpdatedAt()))))
            .andExpect(status().isOk());
        mockMvc.perform(delete("/api/academic-data/deliverables/" + deliverable.getId())
            .param("workspaceId", workspace.getId().toString()).cookie(admin).with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(Map.of("expectedUpdatedAt", deliverable.getUpdatedAt()))))
            .andExpect(status().isOk());
        assertThat(projects.findById(project.getId())).isEmpty();
        assertThat(deliverables.findById(deliverable.getId())).isEmpty();
        assertThat(trackerColumns.findById(tracker.getId())).isPresent();
    }

    private Map<String, Object> studentRow(StudentRecord row, String number, String name, String team) {
        return Map.of(
            "id", row.getId().toString(),
            "studentNumber", number,
            "studentName", name,
            "teamCode", team,
            "memberNumber", row.getMemberNumber() == null ? "" : row.getMemberNumber(),
            "sectionName", row.getSectionName() == null ? "" : row.getSectionName(),
            "adviserName", "",
            "institutionalEmail", "",
            "expectedUpdatedAt", row.getUpdatedAt().toString()
        );
    }

    private AcademicWorkspace workspace(String suffix) {
        return workspaces.saveAndFlush(new AcademicWorkspace(
            "Academic Grid " + suffix + " " + UUID.randomUUID(), "IT", "GRID-" + suffix + "-" + UUID.randomUUID(), "Semester 1", "2097-98", true));
    }

    private Cookie adminCookie(String subject) {
        String email = subject + "@example.test";
        Instant now = Instant.now();
        staffRoles.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(), subject, email, StaffRole.ADMIN, true, now, now));
        return sessionCookie(subject, email);
    }

    private Cookie userCookie(String subject) {
        return sessionCookie(subject, subject + "@example.test");
    }

    private Cookie sessionCookie(String subject, String email) {
        var session = sessions.create(new GoogleIdentity(subject, email, subject, ""));
        return new Cookie("WILDTRACK_SESSION", session.rawToken());
    }
}
