package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.deliverable.DeliverableFieldRequest;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRequest;
import com.capvault.backend.deliverable.DeliverableService;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.tracker.TrackerColumn;
import com.capvault.backend.tracker.TrackerColumnRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/** Real full-page editor -> HTTP -> Spring -> H2 -> reload -> public response. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "capvault.cors.allowed-origins=http://127.0.0.1:4181",
    "spring.datasource.url=jdbc:h2:mem:form-editor-journey;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH"
})
@ActiveProfiles("test")
class FormEditorPersistenceJourneyIT {
    @LocalServerPort int port;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentRecordRepository students;
    @Autowired TrackerColumnRepository trackerColumns;
    @Autowired DeliverableService deliverables;
    @Autowired StaffRoleAssignmentRepository roles;
    @Autowired WildTrackSessionService sessions;

    @Test
    void editorSavePublishReloadAndStudentResponseUseTheRealBackend() throws Exception {
        String workspaceName = "Form editor persistence";
        var workspace = workspaces.save(new AcademicWorkspace(workspaceName, "IT", "IT411", "Semester 1", "2098-99", true));
        students.save(new StudentRecord(
            workspace.getId(), "25-9999-010", "Editor Journey Student", "JOURNEY-EDITOR", "1", "G7", "", null, 1));
        trackerColumns.save(new TrackerColumn(
            workspace.getId(), "LINK", "Link", "Link", 0, 0, true, false));
        var form = deliverables.createDeliverable(workspace.getId(), new DeliverableRequest(
            "LINK",
            "Editor Journey Form",
            "editor-journey-form",
            "Submit a project link and the configured questions.",
            LocalDateTime.of(2099, 1, 1, 23, 59),
            false,
            DeliverableStatus.UNPUBLISHED,
            List.of(new DeliverableFieldRequest(
                null, "primaryLink", "Submission Link", DeliverableFieldType.GENERAL_URL,
                true, 0, DocumentCheckPolicy.OFF, false, true))
        ));
        roles.save(new StaffRoleAssignment(
            UUID.randomUUID(), "editor-journey-admin", "editor-journey-admin@example.test",
            StaffRole.ADMIN, true, Instant.now(), Instant.now()));
        var studentSession = sessions.create(new GoogleIdentity(
            "editor-journey-student", "editor-journey-student@example.test", "Editor Journey Student", ""));
        var adminSession = sessions.create(new GoogleIdentity(
            "editor-journey-admin", "editor-journey-admin@example.test", "Editor Journey Admin", ""));

        var frontend = Path.of("..", "frontend").toAbsolutePath().normalize();
        var builder = new ProcessBuilder(
            "node", "node_modules/@playwright/test/cli.js", "test",
            "--config", "playwright.persistence.config.js",
            "tests/persistence/form-editor-backend-journey.spec.js")
            .directory(frontend.toFile()).inheritIO();
        builder.environment().put("WILDTRACK_LOCAL_BACKEND_ORIGIN", "http://127.0.0.1:" + port);
        builder.environment().put("JOURNEY_WORKSPACE", workspace.getId().toString());
        builder.environment().put("JOURNEY_WORKSPACE_NAME", workspaceName);
        builder.environment().put("JOURNEY_FORM", form.id().toString());
        builder.environment().put("JOURNEY_STUDENT_SESSION", studentSession.rawToken());
        builder.environment().put("JOURNEY_ADMIN_SESSION", adminSession.rawToken());
        var process = builder.start();
        try {
            assertThat(process.waitFor(5, TimeUnit.MINUTES)).as("Editor browser journey completed within five minutes").isTrue();
            assertThat(process.exitValue()).as("Real-backend form editor Playwright journey").isZero();
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroy);
                process.destroyForcibly();
            }
            sessions.revoke(studentSession.rawToken());
            sessions.revoke(adminSession.rawToken());
        }
    }
}
