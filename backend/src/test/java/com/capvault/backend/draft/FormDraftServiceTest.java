package com.capvault.backend.draft;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.response.FormResponseService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FormDraftServiceTest {

    @Autowired
    private FormDraftService draftService;

    @Autowired
    private FormResponseDraftRepository draftRepository;

    @Autowired
    private StudentAssociationService associationService;

    @Autowired
    private FormResponseService responseService;

    @Autowired
    private StudentRecordRepository studentRecordRepository;

    @Autowired
    private AcademicWorkspaceRepository workspaceRepository;

    @Autowired
    private DeliverableRepository deliverableRepository;

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
        associationService.confirmAssociation(workspaceId, "sub-A", "a@gmail.com", rosterNumber);
    }

    private FormDraftService.DraftState save(String subject, Map<String, Object> values, Long revision) {
        return draftService.save(workspaceId, deliverableId, subject, values, revision);
    }

    @Test
    void autosaveCreatesAndRestoresDraft() {
        var saved = save("sub-A", Map.of("driveLink", "https://drive.example/draft-1"), null);

        assertThat(saved.present()).isTrue();
        assertThat(saved.revision()).isGreaterThanOrEqualTo(0);

        var restored = draftService.restore(workspaceId, deliverableId, "sub-A").orElseThrow();
        assertThat(restored.values().toString()).contains("draft-1");
    }

    @Test
    void identicalAutosaveDoesNotBumpRevision() {
        var first = save("sub-A", Map.of("link", "x"), null);
        long revBefore = first.revision();

        var second = save("sub-A", Map.of("link", "x"), first.revision());

        assertThat(second.revision()).isEqualTo(revBefore);
    }

    @Test
    void staleRevisionIsRejected() {
        var first = save("sub-A", Map.of("link", "v1"), null);
        // Another tab saves using the correct current revision:
        save("sub-A", Map.of("link", "v2"), first.revision());
        // A stale tab still sending the OLD revision must be rejected:
        assertThatThrownBy(() -> save("sub-A", Map.of("link", "v3"), first.revision()))
            .isInstanceOf(FormDraftService.StaleRevisionException.class);
    }

    @Test
    void deliberateClearRemovesDraft() {
        save("sub-A", Map.of("link", "x"), null);
        draftService.clear(workspaceId, deliverableId, "sub-A");

        assertThat(draftService.restore(workspaceId, deliverableId, "sub-A")).isEmpty();
    }

    @Test
    void submissionMarksDraftCompletedWithoutDeletingResponse() {
        associate_and_submit();

        var restored = draftService.restore(workspaceId, deliverableId, "sub-A");
        assertThat(restored).isEmpty(); // completed drafts are not restored

        // The submitted response still exists:
        assertThat(responseService.ownedResponse(workspaceId, deliverableId, "sub-A")).isPresent();
    }

    private void associate_and_submit() {
        save("sub-A", Map.of("driveLink", "https://drive.example/final"), null);
        responseService.submit(new FormResponseService.SubmitCommand(
            workspaceId, deliverableId, "sub-A", "a@gmail.com",
            Map.of("driveLink", "https://drive.example/final")));
        draftService.markCompleted(workspaceId, deliverableId, "sub-A");
    }

    @Test
    void completedDraftIsNotResurrectedByLaterSave() {
        associate_and_submit();
        var attempt = save("sub-A", Map.of("link", "post-submission"), null);

        assertThat(attempt.completed()).isTrue();
        assertThat(attempt.present()).isFalse();
    }

    @Test
    void crossAccountDraftPrivacy() {
        save("sub-A", Map.of("secret", "a-private-value"), null);

        // sub-B has no draft for this form
        var bRestore = draftService.restore(workspaceId, deliverableId, "sub-B");
        assertThat(bRestore).isEmpty();
    }
}


