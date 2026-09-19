package com.capvault.backend.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.student.CanonicalStudentAccountBinding;
import com.capvault.backend.student.CanonicalStudentAccountBindingRepository;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class AccountBindingSubmissionIT {

    @Autowired private FormResponseService responses;
    @Autowired private FormResponseRepository responseRepository;
    @Autowired private StudentAssociationService associations;
    @Autowired private StudentRecordRepository studentRecords;
    @Autowired private CanonicalStudentAccountBindingRepository bindings;
    @Autowired private AcademicWorkspaceRepository workspaces;
    @Autowired private DeliverableRepository deliverables;
    @Autowired private DeliverableFieldRepository fields;
    @Autowired private JdbcTemplate jdbc;

    @Test
    void firstSuccessfulSaveBindsAndARejectedSaveDoesNotReserveTheStudentNumber() {
        Fixture fixture = fixture("atomic");

        assertThatThrownBy(() -> submit(fixture, "subject-bad", "bad@example.test", Map.of(), null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Answer is required");
        assertThat(bindings.findById(key(fixture.studentNumber()))).isEmpty();
        assertThat(responseRepository.findAllByDeliverableId(fixture.deliverableId())).isEmpty();

        FormResponseService.SaveResult saved = submit(fixture, "subject-good", "good@example.test",
            Map.of("answer", "ready"), null);
        CanonicalStudentAccountBinding binding = bindings.findById(key(fixture.studentNumber())).orElseThrow();
        assertThat(binding.isBound()).isTrue();
        assertThat(binding.getGoogleSubject()).isEqualTo("subject-good");
        assertThat(saved.response().getStudentNumber()).isEqualTo(fixture.studentNumber());
        assertThat(jdbc.queryForList("select action from domain_audit_events where workspace_id = ?", String.class,
            fixture.workspaceId())).contains("ACCOUNT_BOUND_ON_FIRST_SUCCESSFUL_SUBMISSION", "RESPONSE_SAVED");
    }

    @Test
    void bindingRollsBackWhenTheFirstResponseCannotCommit() {
        Fixture fixture = fixture("rollback");

        assertThatThrownBy(() -> submit(fixture, "subject-stale", "stale@example.test",
            Map.of("answer", "ready"), 99L))
            .isInstanceOf(FormResponseService.ConcurrentModificationException.class);

        assertThat(bindings.findById(key(fixture.studentNumber()))).isEmpty();
        assertThat(associations.activeAssociation(fixture.workspaceId(), "subject-stale")).isEmpty();
        assertThat(responseRepository.findAllByDeliverableId(fixture.deliverableId())).isEmpty();
    }

    @Test
    void concurrentAlternateAccountsProduceExactlyOneBindingAndOneResponse() throws Exception {
        Fixture fixture = fixture("concurrent");
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> runAfter(start, () -> submit(fixture, "subject-a", "a@example.test",
                Map.of("answer", "A"), null)));
            var second = executor.submit(() -> runAfter(start, () -> submit(fixture, "subject-b", "b@example.test",
                Map.of("answer", "B"), null)));
            start.countDown();

            List<Object> results = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
            long savedCount = results.stream().filter(FormResponseService.SaveResult.class::isInstance).count();
            long blockedCount = results.stream().filter(StudentAssociationService.AccountBindingConflictException.class::isInstance).count();
            assertThat(savedCount).isEqualTo(1);
            assertThat(blockedCount).isEqualTo(1);
        }

        CanonicalStudentAccountBinding binding = bindings.findById(key(fixture.studentNumber())).orElseThrow();
        assertThat(binding.isBound()).isTrue();
        assertThat(responseRepository.findAllByDeliverableId(fixture.deliverableId())).hasSize(1);
        assertThat(responseRepository.findAllByDeliverableId(fixture.deliverableId()).get(0).getGoogleSubject())
            .isEqualTo(binding.getGoogleSubject());
    }

    @Test
    void concurrentCrossSemesterFirstClaimsNeverSurfaceARawConstraintFailure() throws Exception {
        String studentNumber = "31-" + UUID.randomUUID().toString().substring(0, 8);
        Fixture first = fixture("cross-race-a", studentNumber, "Team-A");
        Fixture second = fixture("cross-race-b", studentNumber, "Team-B");
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> runAfter(start, () -> submit(first, "cross-subject-a", "a@example.test",
                Map.of("answer", "A"), null)));
            var b = executor.submit(() -> runAfter(start, () -> submit(second, "cross-subject-b", "b@example.test",
                Map.of("answer", "B"), null)));
            start.countDown();

            List<Object> results = List.of(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
            assertThat(results.stream().filter(FormResponseService.SaveResult.class::isInstance).count()).isEqualTo(1);
            assertThat(results.stream().filter(StudentAssociationService.AccountBindingConflictException.class::isInstance).count())
                .isEqualTo(1);
        }

        assertThat(bindings.findById(key(studentNumber))).isPresent();
    }

    @Test
    void canonicalBindingCarriesAcrossSemestersWithoutGrantingAnotherRosterIdentity() {
        Fixture firstSemester = fixture("semester-one", "30-1000-001", "Team-1");
        submit(firstSemester, "subject-semester-owner", "semester-owner@example.test", Map.of("answer", "first"), null);

        Fixture secondSemester = fixture("semester-two", firstSemester.studentNumber(), "Team-9");
        var carried = associations.activeAssociation(secondSemester.workspaceId(), "subject-semester-owner").orElseThrow();
        assertThat(carried.studentNumber()).isEqualTo(firstSemester.studentNumber());
        assertThat(carried.teamCode()).isEqualTo("Team-9");
        assertThat(associations.activeAssociation(secondSemester.workspaceId(), "other-subject")).isEmpty();

        FormResponseService.SaveResult next = submit(secondSemester, "subject-semester-owner", "semester-owner@example.test",
            Map.of("answer", "second"), null);
        assertThat(next.response().getTeamCode()).isEqualTo("Team-9");
        assertThatThrownBy(() -> submit(secondSemester, "other-subject", "other@example.test",
            Map.of("answer", "blocked"), null))
            .isInstanceOf(StudentAssociationService.AccountBindingConflictException.class);
    }

    @Test
    void adminDisconnectBlocksOldResponseEditingUntilExplicitRecovery() {
        Fixture fixture = fixture("recovery");
        FormResponseService.SaveResult first = submit(fixture, "subject-recovery-owner", "recovery-owner@example.test",
            Map.of("answer", "original"), null);

        associations.adminDisconnect(fixture.workspaceId(), fixture.studentRecordId(), "admin-subject", "admin@example.test");
        assertThat(associations.activeAssociation(fixture.workspaceId(), "subject-recovery-owner")).isEmpty();
        assertThatThrownBy(() -> submit(fixture, "subject-recovery-owner", "recovery-owner@example.test",
            Map.of("answer", "bypass"), first.response().getRevision()))
            .isInstanceOf(StudentAssociationService.AccountBindingConflictException.class)
            .hasMessageContaining("disconnected");
        assertThat(responses.ownedResponse(fixture.workspaceId(), fixture.deliverableId(), "subject-recovery-owner")).isEmpty();
        assertThatThrownBy(() -> responses.history(
            fixture.workspaceId(), fixture.deliverableId(), "subject-recovery-owner"))
            .isInstanceOf(IllegalArgumentException.class);

        var unbound = associations.accountManagement(fixture.workspaceId()).accounts().get(0);
        assertThat(unbound.status()).isEqualTo("UNBOUND");
        assertThat(unbound.candidates()).extracting(StudentAssociationService.AccountCandidate::googleSubject)
            .contains("subject-recovery-owner");

        associations.adminRecover(fixture.workspaceId(), fixture.studentRecordId(), "subject-recovery-owner",
            "admin-subject", "admin@example.test");
        assertThat(responses.ownedResponse(fixture.workspaceId(), fixture.deliverableId(), "subject-recovery-owner").orElseThrow()
            .getValuesJson()).contains("original").doesNotContain("bypass");
        FormResponseService.SaveResult edited = submit(fixture, "subject-recovery-owner", "recovery-owner@example.test",
            Map.of("answer", "recovered edit"), first.response().getRevision());
        assertThat(edited.response().getValuesJson()).contains("recovered edit");
        assertThat(jdbc.queryForList("select action from domain_audit_events where workspace_id = ?", String.class,
            fixture.workspaceId())).contains("ACCOUNT_BINDING_ADMIN_DISCONNECTED", "ACCOUNT_BINDING_ADMIN_RECOVERED");
    }

    private FormResponseService.SaveResult submit(Fixture fixture, String subject, String email,
            Map<String, Object> values, Long revision) {
        return responses.submit(new FormResponseService.SubmitCommand(
            fixture.workspaceId(), fixture.deliverableId(), subject, email, fixture.studentNumber(), values, revision));
    }

    private Object runAfter(CountDownLatch start, ThrowingSupplier supplier) {
        try {
            start.await();
            return supplier.get();
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Fixture fixture(String suffix) {
        return fixture(suffix, "30-" + UUID.randomUUID().toString().substring(0, 8), "Team-1");
    }

    private Fixture fixture(String suffix, String studentNumber, String teamCode) {
        String token = UUID.randomUUID().toString().substring(0, 8);
        AcademicWorkspace workspace = workspaces.saveAndFlush(new AcademicWorkspace(
            "Binding " + suffix + " " + token, "IT", "B" + token, "Semester 1", "2026-27", true));
        StudentRecord student = studentRecords.saveAndFlush(new StudentRecord(
            workspace.getId(), studentNumber, "Binding Student " + suffix, teamCode, "1", "S1", "Adviser", null, 1));
        Deliverable deliverable = deliverables.saveAndFlush(new Deliverable(
            workspace.getId(), "D-" + token, "Binding form", "binding-" + token,
            "Answer the form.", LocalDateTime.parse("2026-12-31T23:59:00"), false, DeliverableStatus.PUBLISHED));
        fields.saveAndFlush(new DeliverableField(
            "answer-" + token, deliverable.getId(), "answer", "Answer", DeliverableFieldType.SHORT_TEXT,
            true, 0, DocumentCheckPolicy.OFF, false, true));
        return new Fixture(workspace.getId(), student.getId(), deliverable.getId(), studentNumber);
    }

    private static String key(String studentNumber) {
        return studentNumber.trim().toLowerCase(java.util.Locale.ROOT);
    }

    private record Fixture(UUID workspaceId, UUID studentRecordId, UUID deliverableId, String studentNumber) { }

    @FunctionalInterface
    private interface ThrowingSupplier {
        Object get() throws Exception;
    }
}
