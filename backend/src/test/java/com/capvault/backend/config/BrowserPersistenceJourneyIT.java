package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.staff.*;
import com.capvault.backend.student.*;
import com.capvault.backend.workspace.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/** Real browser -> HTTP -> Spring services -> isolated database -> browser reload.
 * Only the Google login handoff is seeded; no application requests are intercepted.
 * Run explicitly: mvn -Dtest=BrowserPersistenceJourneyIT test
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "capvault.cors.allowed-origins=http://127.0.0.1:4181",
    "spring.datasource.url=jdbc:h2:mem:browser-journey;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH"
})
@ActiveProfiles("test")
class BrowserPersistenceJourneyIT {
    @LocalServerPort int port;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentRecordRepository students;
    @Autowired DeliverableRepository deliverables;
    @Autowired StaffRoleAssignmentRepository roles;
    @Autowired WildTrackSessionService sessions;

    @Test
    void studentAndStaffMutationsSurviveCleanBrowserStorageReload() throws Exception {
        var workspace = workspaces.save(new AcademicWorkspace("Browser persistence", "IT", "IT332", "Browser", "2098-99", true));
        students.save(new StudentRecord(workspace.getId(), "25-9999-009", "Journey Student", "JOURNEY", "1", "IT01", "", null, 1));
        var form = deliverables.save(new Deliverable(workspace.getId(), "LINK", "Journey Deliverable", "journey-form",
            "Submit your project link.", LocalDateTime.of(2099, 1, 1, 23, 59), false, DeliverableStatus.PUBLISHED));
        roles.save(new StaffRoleAssignment(UUID.randomUUID(), "journey-admin", "journey-admin@example.test", StaffRole.ADMIN,
            true, Instant.now(), Instant.now()));
        var student = sessions.create(new GoogleIdentity("journey-student", "journey-student@example.test", "Journey Student", ""));
        var admin = sessions.create(new GoogleIdentity("journey-admin", "journey-admin@example.test", "Journey Admin", ""));
        var frontend = Path.of("..", "frontend").toAbsolutePath().normalize();
        var builder = new ProcessBuilder("node", "node_modules/@playwright/test/cli.js", "test", "--config", "playwright.persistence.config.js")
            .directory(frontend.toFile()).inheritIO();
        builder.environment().put("WILDTRACK_LOCAL_BACKEND_ORIGIN", "http://127.0.0.1:" + port);
        builder.environment().put("JOURNEY_WORKSPACE", workspace.getId().toString());
        builder.environment().put("JOURNEY_FORM", form.getId().toString());
        builder.environment().put("JOURNEY_STUDENT_SESSION", student.rawToken());
        builder.environment().put("JOURNEY_ADMIN_SESSION", admin.rawToken());
        var process = builder.start();
        try {
            assertThat(process.waitFor(5, TimeUnit.MINUTES)).as("Browser journey completed within five minutes").isTrue();
            assertThat(process.exitValue()).as("Real-backend Playwright journey").isZero();
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroy);
                process.destroyForcibly();
            }
            sessions.revoke(student.rawToken());
            sessions.revoke(admin.rawToken());
        }
    }
}
