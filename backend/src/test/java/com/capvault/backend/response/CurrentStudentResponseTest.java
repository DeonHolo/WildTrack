package com.capvault.backend.response;

import static org.assertj.core.api.Assertions.*;
import java.time.*;
import java.util.*;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.student.*;
import com.capvault.backend.workspace.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CurrentStudentResponseTest {
    @Autowired FormResponseService service;
    @Autowired FormResponseRepository responses;
    @Autowired StudentAssociationService accounts;
    @Autowired StudentRecordRepository students;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired DeliverableRepository deliverables;
    @Autowired ReviewFeedbackService reviews;

    record Fixture(UUID workspace, UUID form, StudentRecord student) { }
    Fixture fixture() {
        String suffix=UUID.randomUUID().toString();
        var workspace=workspaces.saveAndFlush(new AcademicWorkspace("Test " + suffix, "IT", suffix, "1", "2026", true));
        var student=students.saveAndFlush(new StudentRecord(workspace.getId(), suffix, "Student", "Team", "1", "G1", "Adviser", null, 1));
        var form=deliverables.saveAndFlush(new Deliverable(workspace.getId(), "SRS", "SRS", "srs", "Submit", LocalDateTime.now(), true, DeliverableStatus.PUBLISHED));
        return new Fixture(workspace.getId(), form.getId(), student);
    }
    FormResponse save(Fixture f, String subject, String answer, Long revision) {
        return service.submit(new FormResponseService.SubmitCommand(f.workspace(), f.form(), subject, subject+"@test.invalid",
            f.student().getStudentNumber(), "Student", Map.of("answer", answer), revision)).response();
    }
    void disconnect(Fixture f) { accounts.adminDisconnect(f.workspace(), f.student().getId(), "admin", "admin@test.invalid"); }

    @Test void replacementAccountCreatesOneCurrentResponseAndKeepsOldAnswersInStaffHistory() {
        var f=fixture(); var old=save(f, "old-"+UUID.randomUUID(), "old answer", null);
        disconnect(f);
        var latest=save(f, "new-"+UUID.randomUUID(), "latest answer", null);
        assertThat(responses.findAllByWorkspaceId(f.workspace())).extracting(FormResponse::getId).containsExactly(latest.getId());
        assertThat(responses.findById(old.getId()).orElseThrow().getValuesJson()).contains("old answer");
        assertThat(service.earlierSubmissions(latest.getId(), f.workspace(), List.of(), true)).extracting(FormResponse::getId).containsExactly(old.getId());
        assertThat(service.ownedResponse(f.workspace(), f.form(), old.getGoogleSubject())).isEmpty();
        assertThatThrownBy(() -> reviews.accept(old.getId(), "admin", "admin@test.invalid", "ADMIN"))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("newer submission");
    }
    @Test void returningAccountCanSubmitAgainWithoutCreatingAnotherCurrentRowOrRevivingAnOldTab() {
        var f=fixture(); String a="a-"+UUID.randomUUID(), b="b-"+UUID.randomUUID();
        var original=save(f, a, "original", null);
        long oldRevision=original.getRevision();
        disconnect(f); var other=save(f, b, "replacement", null); disconnect(f);
        accounts.connectDirectly(f.workspace(), a, a+"@test.invalid", f.student().getStudentNumber());
        assertThatThrownBy(() -> save(f, a, "stale old tab", oldRevision)).isInstanceOf(FormResponseService.ConcurrentModificationException.class);
        var latest=save(f, a, "new intentional save", null);
        assertThat(latest.getId()).isEqualTo(original.getId());
        assertThat(responses.findAllByWorkspaceId(f.workspace())).extracting(FormResponse::getId).containsExactly(latest.getId());
        assertThat(responses.findById(other.getId()).orElseThrow().isCurrentResponse()).isFalse();
        assertThat(service.history(f.workspace(), f.form(), a)).anyMatch(row -> row.get("values").toString().contains("original"));
    }
    @Test void ordinaryEditsKeepTheSameRowAndEarlierAccountsAreNotExposedToOtherTeamsOrStudents() {
        var f=fixture(); String subject="owner-"+UUID.randomUUID(); var first=save(f, subject, "one", null);
        var updated=save(f, subject, "two", first.getRevision());
        assertThat(updated.getId()).isEqualTo(first.getId());
        assertThat(responses.findAllByDeliverableId(f.form())).hasSize(1);
        assertThat(service.earlierSubmissions(updated.getId(), f.workspace(), List.of("Team"), false)).isEmpty();
        assertThatThrownBy(() -> service.earlierSubmissions(updated.getId(), f.workspace(), List.of("Other"), false))
            .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }
    @Test void databaseRejectsAnotherCurrentRowEvenIfApplicationSubmissionRulesAreBypassed() {
        var f=fixture(); save(f, "owner-"+UUID.randomUUID(), "one", null);
        var now=Instant.now();
        assertThatThrownBy(() -> responses.saveAndFlush(new FormResponse(UUID.randomUUID(), f.workspace(), f.form(), "other-"+UUID.randomUUID(),
            "other@test.invalid", f.student().getId(), f.student().getStudentNumber().toUpperCase(Locale.ROOT), "Student", "Team", "{}", now, now)))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }
}
