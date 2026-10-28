package com.capvault.backend.student;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StudentEntryIntegrationTest {
    @Autowired StudentEntryService entry;
    @Autowired StudentRecordRepository records;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentAssociationService associations;
    @Autowired WildTrackSessionService sessions;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private record Fixture(AcademicWorkspace workspace, StudentRecord record) {}
    private Fixture fixture(boolean activeWorkspace, boolean activeRecord) {
        String id = UUID.randomUUID().toString();
        var workspace = workspaces.saveAndFlush(new AcademicWorkspace("Entry " + id, "IT", id, "1", "2026", activeWorkspace));
        var record = new StudentRecord(workspace.getId(), id, "Full Student Name", "Team-7", "1", "S", "A", null, 1);
        record.setCurrentActive(activeRecord);
        return new Fixture(workspace, records.saveAndFlush(record));
    }
    private StudentAssociationService.AssociationView connect(Fixture f, String subject) {
        return entry.connect(subject, subject + "@example.test", f.record().getStudentNumber(), "Full Student Name", "Team-7");
    }

    @Test void matchingOwnershipIdempotenceAndAudit() {
        Fixture f = fixture(true, true);
        String owner = UUID.randomUUID().toString();
        assertThat(connect(f, owner).workspaceId()).isEqualTo(f.workspace().getId());
        assertThat(connect(f, owner).studentRecordId()).isEqualTo(f.record().getId());
        assertThatThrownBy(() -> connect(f, UUID.randomUUID().toString())).isInstanceOf(StudentAssociationService.AccountBindingConflictException.class);
        assertThatThrownBy(() -> connect(fixture(true, true), owner)).isInstanceOf(StudentAssociationService.AccountBindingConflictException.class);
        var actions = jdbc.queryForList("select action from domain_audit_events where workspace_id = ?", String.class, f.workspace().getId());
        assertThat(actions).contains("ACCOUNT_BOUND_ON_DIRECT_CONNECTION").doesNotContain("ACCOUNT_BOUND_ON_FIRST_SUCCESSFUL_SUBMISSION", "RESPONSE_SAVED");
        associations.adminDisconnect(f.workspace().getId(), f.record().getId(), "admin", "admin@example.test");
        assertThatThrownBy(() -> connect(f, owner)).isInstanceOf(StudentAssociationService.AccountBindingConflictException.class);
    }

    @Test void mismatchesInactiveRecordsAndThrottle() {
        Fixture f = fixture(true, true);
        String subject = UUID.randomUUID().toString();
        for (String[] values : new String[][] {{"wrong", "Full Student Name", "Team-7"},
                {f.record().getStudentNumber(), "Full Student", "Team-7"},
                {f.record().getStudentNumber(), "Full Student Name", "wrong"}}) {
            assertThatThrownBy(() -> entry.connect(subject, "a@example.test", values[0], values[1], values[2]))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("Student details do not match an active class record.");
        }
        Fixture inactiveWorkspace = fixture(false, true), inactiveRecord = fixture(true, false);
        assertThatThrownBy(() -> connect(inactiveWorkspace, subject)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> connect(inactiveRecord, subject)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> connect(f, subject)).isInstanceOf(StudentEntryService.ThrottledException.class);
    }

    @Test void concurrentClaimsHaveOneWinner() throws Exception {
        Fixture f = fixture(true, true);
        var latch = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> attempt(f, latch));
            var b = pool.submit(() -> attempt(f, latch));
            latch.countDown();
            assertThat(java.util.List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(true, false);
        }
    }
    private boolean attempt(Fixture f, CountDownLatch latch) throws Exception {
        latch.await();
        try { connect(f, UUID.randomUUID().toString()); return true; }
        catch (StudentAssociationService.AccountBindingConflictException expected) { return false; }
    }

    @Test void httpRequiresSessionAndCsrfAndDoesNotExposeRoster() throws Exception {
        Fixture f = fixture(true, true);
        var login = sessions.create(new GoogleIdentity(UUID.randomUUID().toString(), "student@example.test", "Student", ""));
        var cookie = new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", login.rawToken());
        String body = "{\"studentNumber\":\"" + f.record().getStudentNumber() + "\",\"studentName\":\"Full Student Name\",\"teamCode\":\"Team-7\"}";
        mvc.perform(post("/api/workspace/students/connect").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/workspace/students/connect").cookie(cookie).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/api/workspace/students/connect").cookie(cookie).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.workspaceId").value(f.workspace().getId().toString())).andExpect(jsonPath("$.students").doesNotExist());
        mvc.perform(get("/api/workspace/students/options").param("workspaceId", f.workspace().getId().toString()).cookie(cookie)).andExpect(status().isForbidden());
    }

    @Test void httpRepeatedMismatchesHaveOneGenericMessageAndAUsefulRetryNotice() throws Exception {
        var login = sessions.create(new GoogleIdentity(UUID.randomUUID().toString(), "throttle@example.test", "Student", ""));
        var cookie = new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", login.rawToken());
        String body = "{\"studentNumber\":\"unknown\",\"studentName\":\"unknown\",\"teamCode\":\"unknown\"}";
        for (int i=0; i<5; i++) mvc.perform(post("/api/workspace/students/connect").cookie(cookie).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Student details do not match an active class record."));
        mvc.perform(post("/api/workspace/students/connect").cookie(cookie).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "60"))
            .andExpect(jsonPath("$.error").value("Too many attempts. Wait a minute before trying again."));
    }

    @Test void httpExistingClaimReturnsConflictWithoutReplacingTheOwner() throws Exception {
        Fixture f=fixture(true,true);
        String owner=UUID.randomUUID().toString();
        connect(f,owner);
        String claimant=UUID.randomUUID().toString();
        var login=sessions.create(new GoogleIdentity(claimant,"new-account@example.test","Student",""));
        var cookie=new jakarta.servlet.http.Cookie("WILDTRACK_SESSION",login.rawToken());
        String body="{\"studentNumber\":\""+f.record().getStudentNumber()+"\",\"studentName\":\"Full Student Name\",\"teamCode\":\"Team-7\"}";
        mvc.perform(post("/api/workspace/students/connect").cookie(cookie).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("This Student Number is already associated with another Google account. Ask an administrator to review the account binding."));
        assertThat(associations.activeAssociation(f.workspace().getId(),owner)).isPresent();
        assertThat(associations.activeAssociation(f.workspace().getId(),claimant)).isEmpty();
    }

    @Test void httpDisconnectedAccountCannotReclaimItselfAndHasNoWorkspaceCatalogue() throws Exception {
        Fixture f=fixture(true,true);
        String owner=UUID.randomUUID().toString();
        connect(f,owner);
        associations.adminDisconnect(f.workspace().getId(),f.record().getId(),"admin","admin@example.test");
        var login=sessions.create(new GoogleIdentity(owner,"owner@example.test","Student",""));
        var cookie=new jakarta.servlet.http.Cookie("WILDTRACK_SESSION",login.rawToken());
        mvc.perform(get("/api/workspaces").cookie(cookie)).andExpect(status().isOk()).andExpect(content().json("[]"));
        String body="{\"studentNumber\":\""+f.record().getStudentNumber()+"\",\"studentName\":\"Full Student Name\",\"teamCode\":\"Team-7\"}";
        mvc.perform(post("/api/workspace/students/connect").cookie(cookie).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("This Google account was disconnected from the Student Number by an administrator. Ask an administrator to recover the account binding."));
        assertThat(associations.activeAssociation(f.workspace().getId(),owner)).isEmpty();
    }
}
