package com.capvault.backend.response;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.context.transaction.TestTransaction;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FormResponseServiceTest {

    @Autowired
    private FormResponseService service;

    @Autowired
    private FormResponseRepository responseRepository;

    @Autowired
    private DeliverableRepository deliverableRepository;

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private StudentAssociationService associationService;

    @Autowired
    private FileCheckReportRepository fileCheckReportRepository;

    @Autowired
    private JdbcTemplate jdbc;

    private UUID workspaceId;
    private UUID deliverableId;
    private String rosterNumber = "20-0649-750";

    @BeforeEach
    void seed() {
        AcademicWorkspace workspace = workspaceRepository.save(new AcademicWorkspace(
            "IT332 Sem 2", "IT", "IT332", "Semester 1", "2026-27", true));
        workspaceId = workspace.getId();
        studentRecordRepository.save(new StudentRecord(
            workspaceId, rosterNumber, "Deon Holo", "2526-it332-41", "1", "IT41", "Sir Adviser", null, 1));
        Deliverable deliverable = deliverableRepository.save(new Deliverable(
            workspaceId, "SRS", "SRS Submission", "srs-week9",
            "Submit a PDF Drive link.", LocalDateTime.parse("2026-04-18T23:59:00"),
            true, DeliverableStatus.PUBLISHED));
        deliverableId = deliverable.getId();
    }

    private void associate(String subject) {
        associationService.confirmAssociation(workspaceId, subject, subject + "@gmail.com", rosterNumber);
    }

    private FormResponseService.SaveResult submitFor(String subject, Map<String, Object> values) {
        return service.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, subject, subject + "@gmail.com", values,
            service.ownedResponse(workspaceId, deliverableId, subject).map(FormResponse::getRevision).orElse(null)));
    }

    @Test
    void firstSubmissionRequiresActiveAssociation() {
        assertThatThrownBy(() -> submitFor("sub-X", Map.of("link", "https://drive.example/a")))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("Connect your Student Record");
    }

    @Test
    void firstSubmissionSnapshotsRosterRecordAndStoresValues() {
        associate("sub-A");
        var result = submitFor("sub-A", Map.of("driveLink", "https://drive.example/a"));

        assertThat(result.changed()).isTrue();
        assertThat(result.response().getStudentNumber()).isEqualTo(rosterNumber);
        assertThat(result.response().getValuesJson()).contains("drive.example");
        assertThat(responseRepository.findById(result.response().getId())).isPresent();
    }

    @Test
    void identicalResaveIsUnchanged() {
        associate("sub-A");
        var first = submitFor("sub-A", Map.of("driveLink", "https://drive.example/a"));
        long revisionBefore = first.clientRevision();

        var second = submitFor("sub-A", Map.of("driveLink", "https://drive.example/a"));

        assertThat(second.changed()).isFalse();
        assertThat(second.response().getRevision()).isEqualTo(revisionBefore);
        // No version row archived for identical resave
        assertThat(service.history(workspaceId, deliverableId, "sub-A")).isEmpty();
    }

    @Test
    void materialEditArchivesVersionAndBumpsRevision() {
        associate("sub-A");
        var first = submitFor("sub-A", Map.of("driveLink", "https://drive.example/a"));
        long revisionBefore = first.clientRevision();

        var second = submitFor("sub-A", Map.of("driveLink", "https://drive.example/changed"));
        long revisionAfter = second.clientRevision();

        assertThat(second.changed()).isTrue();
        assertThat(revisionAfter).isGreaterThan(revisionBefore);
        var history = service.history(workspaceId, deliverableId, "sub-A");
        assertThat(history).hasSize(1);
        assertThat(history.get(0).get("values").toString()).contains("drive.example/a");
    }

    @Test
    void ownershipIsByGoogleSubjectNotStudentNumber() {
        associate("sub-A");
        // sub-B associates the SAME roster record (conflict path from ticket 03)
        associationService.confirmAssociation(workspaceId, "sub-B", "b@gmail.com", rosterNumber);

        submitFor("sub-A", Map.of("driveLink", "https://drive.example/a-owned"));
        submitFor("sub-B", Map.of("driveLink", "https://drive.example/b-owned"));

        // Each identity owns exactly its own response; neither can see or overwrite the other's.
        var aView = service.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow();
        var bView = service.ownedResponse(workspaceId, deliverableId, "sub-B").orElseThrow();
        assertThat(aView.getValuesJson()).contains("a-owned").doesNotContain("b-owned");
        assertThat(bView.getValuesJson()).contains("b-owned").doesNotContain("a-owned");

        // Editing B's response as A is impossible: A's save touches only A's row.
        service.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, "sub-A", "a@gmail.com", Map.of("driveLink", "https://drive.example/a-edit"), aView.getRevision()));
        assertThat(service.ownedResponse(workspaceId, deliverableId, "sub-B").orElseThrow().getValuesJson())
            .contains("b-owned");
    }

    @Test
    void unpublishedFormRejectsNewSubmissionsButPreservesHistory() {
        associate("sub-A");
        var saved = submitFor("sub-A", Map.of("driveLink", "https://drive.example/a"));

        Deliverable deliverable = deliverableRepository.findById(deliverableId).orElseThrow();
        deliverable.setStatus(DeliverableStatus.UNPUBLISHED);
        deliverableRepository.save(deliverable);

        assertThatThrownBy(() -> submitFor("sub-A", Map.of("driveLink", "https://drive.example/b")))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("no longer accepting");

        assertThat(responseRepository.findById(saved.response().getId())).isPresent();
    }

    @Test
    void staleRevisionSurfacesRecoverableConflict() {
        associate("sub-A");
        var first = submitFor("sub-A", Map.of("driveLink", "v1"));
        Long stale = first.clientRevision();
        submitFor("sub-A", Map.of("driveLink", "v2"));
        assertThatThrownBy(() -> service.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, "sub-A", "a@gmail.com", Map.of("driveLink", "stale"), stale)))
            .isInstanceOf(FormResponseService.ConcurrentModificationException.class);
        assertThat(service.ownedResponse(workspaceId, deliverableId, "sub-A").orElseThrow().getValuesJson()).contains("v2");
    }

    @Test
    void submittingResponseWithDriveLinkTriggersAsyncDocumentCheck() {
        associate("sub-auto-check");
        var result = submitFor("sub-auto-check", Map.of("documentPdf", "https://drive.google.com/file/d/123456789/view"));

        assertThat(result.changed()).isTrue();
        assertThat(fileCheckReportRepository.findAllByWorkspaceIdAndExternalResponseIdOrderByCheckedAtDesc(
            workspaceId, result.response().getId().toString())).isEmpty();
        TestTransaction.flagForCommit();
        TestTransaction.end();
        try {
        org.awaitility.Awaitility.await()
            .atMost(java.time.Duration.ofSeconds(5))
            .untilAsserted(() -> {
                var reports = fileCheckReportRepository.findAllByWorkspaceIdAndExternalResponseIdOrderByCheckedAtDesc(
                    workspaceId, result.response().getId().toString());
                assertThat(reports).isNotEmpty();
            });
        } finally {
            jdbc.update("delete from domain_audit_events where workspace_id = ?", workspaceId);
            jdbc.update("delete from academic_file_check_reports where workspace_id = ?", workspaceId);
            jdbc.update("delete from form_responses where workspace_id = ?", workspaceId);
            jdbc.update("delete from workspace_student_associations where workspace_id = ?", workspaceId);
            jdbc.update("delete from academic_student_records where workspace_id = ?", workspaceId);
            jdbc.update("delete from academic_deliverables where workspace_id = ?", workspaceId);
            jdbc.update("delete from academic_workspaces where id = ?", workspaceId);
        }
    }

    @Test
    void pendingTrackerWorkAndAuditCommitOnlyWithMaterialResponseSaves() {
        associate("outbox-owner");
        var saved = submitFor("outbox-owner", Map.of("value", "one"));
        submitFor("outbox-owner", Map.of("value", "one"));
        assertThat(jdbc.queryForObject("select count(*) from response_tracker_outbox where response_id = ?", Integer.class, saved.response().getId())).isEqualTo(1);
        submitFor("outbox-owner", Map.of("value", "two"));
        assertThat(jdbc.queryForObject("select count(*) from response_tracker_outbox where response_id = ? and status = 'PENDING'", Integer.class, saved.response().getId())).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from domain_audit_events where target_id = ? and action = 'RESPONSE_SAVED'", Integer.class, saved.response().getId())).isEqualTo(2);
        TestTransaction.flagForRollback();
        TestTransaction.end();
        assertThat(jdbc.queryForObject("select count(*) from response_tracker_outbox where response_id = ?", Integer.class, saved.response().getId())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from domain_audit_events where target_id = ?", Integer.class, saved.response().getId())).isZero();
        TestTransaction.start();
    }

    @Test
    void reorderingIdenticalFieldsDoesNotWriteAnotherVersionOrOutboxEvent() {
        associate("ordered-owner");
        var firstValues = new java.util.LinkedHashMap<String, Object>();
        firstValues.put("first", "one");
        firstValues.put("second", "two");
        var first = submitFor("ordered-owner", firstValues);
        var reordered = new java.util.LinkedHashMap<String, Object>();
        reordered.put("second", "two");
        reordered.put("first", "one");
        assertThat(submitFor("ordered-owner", reordered).changed()).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from response_tracker_outbox where response_id = ?", Integer.class, first.response().getId())).isEqualTo(1);
    }

    @Test
    void submissionRejectsDeliverableFromAnotherWorkspace() {
        associate("sub-A");
        var other = workspaceRepository.save(new AcademicWorkspace(
            "Other", "IT", "IT332", "Semester 2", "2026-27", true));
        assertThatThrownBy(() -> service.submit(new FormResponseService.SubmitCommand(
            other.getId(), deliverableId, "sub-A", "a@gmail.com", Map.of())))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Deliverable not found");
    }
}
