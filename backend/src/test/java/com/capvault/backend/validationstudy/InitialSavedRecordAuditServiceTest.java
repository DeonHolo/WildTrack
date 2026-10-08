package com.capvault.backend.validationstudy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseVersion;
import com.capvault.backend.response.FormResponseVersionRepository;
import com.capvault.backend.student.CanonicalStudentAccountBinding;
import com.capvault.backend.student.CanonicalStudentAccountBindingRepository;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.student.WorkspaceStudentAssociation;
import com.capvault.backend.student.WorkspaceStudentAssociationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class InitialSavedRecordAuditServiceTest {

    private final FormResponseVersionRepository versions = mock(FormResponseVersionRepository.class);
    private final StudentRecordRepository students = mock(StudentRecordRepository.class);
    private final WorkspaceStudentAssociationRepository associations = mock(WorkspaceStudentAssociationRepository.class);
    private final CanonicalStudentAccountBindingRepository bindings = mock(CanonicalStudentAccountBindingRepository.class);
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID deliverableId = UUID.randomUUID();
    private final Deliverable deliverable = new Deliverable(workspaceId, "validation", "Validation", "validation",
        "", LocalDateTime.of(2099, 1, 1, 0, 0), true, DeliverableStatus.PUBLISHED);
    private final DeliverableField pdf = new DeliverableField("pdf", deliverableId, "documentPdf", "PDF link",
        DeliverableFieldType.DRIVE_PDF, true, 0, DocumentCheckPolicy.MANUAL, false, true);
    private InitialSavedRecordAuditService audit;

    @BeforeEach
    void setUp() {
        audit = new InitialSavedRecordAuditService(versions, students, associations, bindings, new ObjectMapper());
        when(associations.findAllByWorkspaceIdAndStudentRecordIdAndActiveTrueOrderByUpdatedAtDesc(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any())).thenReturn(List.of());
        when(associations.findAllByStudentNumberIgnoreCaseOrderByUpdatedAtDesc(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(List.of());
        when(bindings.findById(org.mockito.ArgumentMatchers.anyString())).thenReturn(java.util.Optional.empty());
    }

    @Test
    void revisionOneUsesCurrentValuesWithoutValidationMarker() {
        Instant submitted = Instant.parse("2098-01-01T01:00:00Z");
        FormResponse response = response("26-001", "Student One", "T1", "subject", submitted,
            submitted.plusSeconds(500), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/one"));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-001", "Student One", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));

        ValidationStudyService.InitialSavedRecords result = run(List.of(response), List.of(pdf));

        assertThat(result.records()).singleElement().satisfies(row -> {
            assertThat(row.originalSource()).isEqualTo("CURRENT_REVISION_1");
            assertThat(row.originalSavedAt()).isEqualTo(submitted);
            assertThat(row.originalVersion().status()).isEqualTo("PASS");
        });
    }

    @Test
    void editedResponseUsesPersistedHistoryRevisionOne() {
        Instant submitted = Instant.parse("2098-01-01T01:00:00Z");
        FormResponse response = response("26-002", "Student Two", "T1", "subject-2", submitted,
            submitted.plusSeconds(100), 2L, Map.of("documentPdf", "https://drive.google.com/file/d/current"));
        when(versions.findAllByResponseIdOrderByRevisionAsc(response.getId())).thenReturn(List.of(
            version(response, 1L, submitted.plusSeconds(10), Map.of("documentPdf", "https://drive.google.com/file/d/original"))));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-002", "Student Two", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));

        ValidationStudyService.InitialSavedRecord row = run(List.of(response), List.of(pdf)).records().get(0);

        assertThat(row.originalSource()).isEqualTo("HISTORY_REVISION_1");
        assertThat(row.originalRevision()).isEqualTo(1L);
        assertThat(row.originalArtifactValue()).contains("original");
    }

    @Test
    void missingOriginalRemainsSelectedAndUnverified() {
        FormResponse response = response("26-003", "Student Three", "T1", "subject-3", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T02:00:00Z"), 2L, Map.of("documentPdf", "https://drive.google.com/file/d/three"));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-003", "Student Three", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));

        ValidationStudyService.InitialSavedRecord row = run(List.of(response), List.of(pdf)).records().get(0);

        assertThat(row.originalSource()).isEqualTo("UNVERIFIED");
        assertThat(row.originalVersion().status()).isEqualTo("UNVERIFIED");
        assertThat(row.overallStatus()).isEqualTo("UNVERIFIED");
    }

    @Test
    void duplicateSelectionKeepsEarliestEvenWhenItIsUnverified() {
        FormResponse early = response("26-004", "Student Four", "T1", "subject-4", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:05:00Z"), 2L, Map.of("documentPdf", "https://drive.google.com/file/d/early"));
        FormResponse later = response("26-004", "Student Four", "T1", "subject-4", Instant.parse("2098-01-01T02:00:00Z"),
            Instant.parse("2098-01-01T02:05:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/later"));
        StudentRecord roster = roster(early.getStudentRecordId(), "26-004", "Student Four", "T1");
        when(students.findById(early.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));
        when(students.findById(later.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));

        ValidationStudyService.InitialSavedRecord row = run(List.of(early, later), List.of(pdf)).records().get(0);

        assertThat(row.responseId()).isEqualTo(early.getId());
        assertThat(row.originalSource()).isEqualTo("UNVERIFIED");
    }

    @Test
    void blankStudentNumbersRemainSeparateCandidates() {
        FormResponse first = response("", "Blank One", "T1", "subject-5", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/a"));
        FormResponse second = response(" ", "Blank Two", "T2", "subject-6", Instant.parse("2098-01-01T02:00:00Z"),
            Instant.parse("2098-01-01T02:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/b"));

        ValidationStudyService.InitialSavedRecords result = run(List.of(first, second), List.of(pdf));

        assertThat(result.selectedRecords()).isEqualTo(2);
        assertThat(result.records()).extracting(ValidationStudyService.InitialSavedRecord::studentName)
            .containsExactlyInAnyOrder("Blank One", "Blank Two");
    }

    @Test
    void rosterMismatchFailsAndVerifiedLegacyBindingPassesAccountCheck() {
        FormResponse response = response("26-005", "Wrong Name", "WRONG", "legacy-subject", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/a"));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-005", "Canonical Name", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));
        CanonicalStudentAccountBinding binding = new CanonicalStudentAccountBinding("26005", Instant.now());
        binding.bind("legacy-subject", "hidden@example.test", Instant.now());
        when(bindings.findById("26-005")).thenReturn(java.util.Optional.of(binding));

        ValidationStudyService.InitialSavedRecord row = run(List.of(response), List.of(pdf)).records().get(0);

        assertThat(row.studentDetails().status()).isEqualTo("FAIL");
        assertThat(row.accountBinding().status()).isEqualTo("PASS");
    }

    @Test
    void punctuationPreservedForCanonicalBindingLookup() {
        FormResponse response = response("26-008", "Student Eight", "T1", "legacy-8", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/8"));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-008", "Student Eight", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));
        CanonicalStudentAccountBinding binding = new CanonicalStudentAccountBinding("26-008", Instant.now());
        binding.bind("legacy-8", "hidden-8@example.test", Instant.now());
        when(bindings.findById("26-008")).thenReturn(java.util.Optional.of(binding));

        ValidationStudyService.InitialSavedRecord row = run(List.of(response), List.of(pdf)).records().get(0);

        assertThat(row.accountBinding().status()).isEqualTo("PASS");
        org.mockito.Mockito.verify(bindings).findById("26-008");
    }

    @Test
    void activeAssociationTakesPrecedenceAndWrongSubjectFailsOverall() {
        FormResponse response = response("26-009", "Student Nine", "T1", "wrong-subject", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/9"));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-009", "Student Nine", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));
        WorkspaceStudentAssociation active = mock(WorkspaceStudentAssociation.class);
        UUID rosterId = roster.getId();
        when(active.getWorkspaceId()).thenReturn(workspaceId);
        when(active.getStudentRecordId()).thenReturn(rosterId);
        when(active.getGoogleSubject()).thenReturn("actual-subject");
        when(active.isActive()).thenReturn(true);
        when(associations.findAllByStudentNumberIgnoreCaseOrderByUpdatedAtDesc("26-009")).thenReturn(List.of(active));

        ValidationStudyService.InitialSavedRecord row = run(List.of(response), List.of(pdf)).records().get(0);

        assertThat(row.accountBinding().status()).isEqualTo("FAIL");
        assertThat(row.overallStatus()).isEqualTo("FAIL");
    }

    @Test
    void nonNullWrongWorkspaceForeignKeyDoesNotFallbackByStudentNumber() {
        FormResponse response = response("26-010", "Student Ten", "T1", "subject-10", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/10"));
        UUID fallbackId = UUID.randomUUID();
        StudentRecord wrongWorkspace = roster(response.getStudentRecordId(), "26-010", "Student Ten", "T1");
        when(wrongWorkspace.getWorkspaceId()).thenReturn(UUID.randomUUID());
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(wrongWorkspace));
        StudentRecord fallback = roster(fallbackId, "26-010", "Student Ten", "T1");
        when(students.findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "26-010"))
            .thenReturn(List.of(fallback));

        ValidationStudyService.InitialSavedRecord row = run(List.of(response), List.of(pdf)).records().get(0);

        assertThat(row.studentDetails().status()).isEqualTo("FAIL");
        org.mockito.Mockito.verify(students, org.mockito.Mockito.never())
            .findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, "26-010");
    }

    @Test
    void malformedObjectCannotSatisfyPdfField() {
        FormResponse response = response("26-011", "Student Eleven", "T1", "subject-11", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", Map.of("url", "https://drive.google.com/file/d/11")));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-011", "Student Eleven", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));

        ValidationStudyService.InitialSavedRecord row = run(List.of(response), List.of(pdf)).records().get(0);

        assertThat(row.storedValues().status()).isEqualTo("FAIL");
        assertThat(row.missingRequiredFieldKeys()).contains("documentPdf");
    }

    @Test
    void blankOrdinaryRequiredTextAndJsonNullAreNotSuccessfulValues() {
        DeliverableField required = new DeliverableField("notes", deliverableId, "notes", "Notes",
            DeliverableFieldType.SHORT_TEXT, true, 0, DocumentCheckPolicy.OFF, false, true);
        FormResponse blank = response("26-012", "Student Twelve", "T1", "subject-12", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("notes", "   ", "documentPdf", "https://drive.google.com/file/d/12"));
        StudentRecord blankRoster = roster(blank.getStudentRecordId(), "26-012", "Student Twelve", "T1");
        when(students.findById(blank.getStudentRecordId())).thenReturn(java.util.Optional.of(blankRoster));
        assertThat(run(List.of(blank), List.of(required, pdf)).records().get(0).missingRequiredFieldKeys()).contains("notes");

        FormResponse nullValues = response("26-013", "Student Thirteen", "T1", "subject-13", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/13"));
        when(nullValues.getValuesJson()).thenReturn("null");
        StudentRecord nullRoster = roster(nullValues.getStudentRecordId(), "26-013", "Student Thirteen", "T1");
        when(students.findById(nullValues.getStudentRecordId())).thenReturn(java.util.Optional.of(nullRoster));
        ValidationStudyService.InitialSavedRecord nullRow = run(List.of(nullValues), List.of(pdf)).records().get(0);
        assertThat(nullRow.storedValues().status()).isEqualTo("FAIL");
        assertThat(nullRow.missingRequiredFieldKeys()).contains("documentPdf");
    }

    @Test
    void missingRequiredAndLinkAreFailuresAndZeroIsInconclusive() throws Exception {
        DeliverableField required = new DeliverableField("name", deliverableId, "studentName", "Student name",
            DeliverableFieldType.SHORT_TEXT, true, 0, DocumentCheckPolicy.OFF, false, true);
        FormResponse response = response("26-006", "Student Six", "T1", "subject-6", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of());
        StudentRecord roster = roster(response.getStudentRecordId(), "26-006", "Student Six", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));

        ValidationStudyService.InitialSavedRecords result = run(List.of(response), List.of(required, pdf));
        assertThat(result.records().get(0).storedValues().status()).isEqualTo("FAIL");
        assertThat(result.records().get(0).missingRequiredFieldKeys()).contains("studentName", "documentPdf");
        ValidationStudyService.InitialSavedRecords empty = run(List.of(), List.of(pdf));
        assertThat(empty.agreement()).isNull();
        assertThat(empty.outcome()).isEqualTo("INCONCLUSIVE");
    }

    @Test
    void auditDtoDoesNotExposeAccountSubjectsOrEmails() throws Exception {
        FormResponse response = response("26-007", "Student Seven", "T1", "private-subject", Instant.parse("2098-01-01T01:00:00Z"),
            Instant.parse("2098-01-01T01:00:00Z"), 1L, Map.of("documentPdf", "https://drive.google.com/file/d/a"));
        StudentRecord roster = roster(response.getStudentRecordId(), "26-007", "Student Seven", "T1");
        when(students.findById(response.getStudentRecordId())).thenReturn(java.util.Optional.of(roster));

        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(run(List.of(response), List.of(pdf)));

        assertThat(json).doesNotContain("private-subject", "googleSubject", "googleEmail", "@example");
    }

    private ValidationStudyService.InitialSavedRecords run(List<FormResponse> responses, List<DeliverableField> fields) {
        return audit.audit(workspaceId, deliverableId, deliverable, fields, responses);
    }

    private FormResponse response(String number, String name, String team, String subject, Instant submitted,
                                  Instant updated, long revision, Map<String, Object> values) {
        FormResponse response = mock(FormResponse.class);
        UUID id = UUID.randomUUID();
        UUID recordId = UUID.randomUUID();
        try {
            when(response.getId()).thenReturn(id);
            when(response.getWorkspaceId()).thenReturn(workspaceId);
            when(response.getDeliverableId()).thenReturn(deliverableId);
            when(response.getStudentRecordId()).thenReturn(recordId);
            when(response.getStudentNumber()).thenReturn(number);
            when(response.getStudentName()).thenReturn(name);
            when(response.getTeamCode()).thenReturn(team);
            when(response.getGoogleSubject()).thenReturn(subject);
            when(response.getSubmittedAt()).thenReturn(submitted);
            when(response.getUpdatedAt()).thenReturn(updated);
            when(response.getRevision()).thenReturn(revision);
            when(response.getValuesJson()).thenReturn(new ObjectMapper().writeValueAsString(values));
        } catch (Exception failure) {
            throw new AssertionError(failure);
        }
        return response;
    }

    private FormResponseVersion version(FormResponse response, long revision, Instant createdAt, Map<String, Object> values) {
        try {
            return new FormResponseVersion(UUID.randomUUID(), response, new ObjectMapper().writeValueAsString(values), revision, createdAt);
        } catch (Exception failure) {
            throw new AssertionError(failure);
        }
    }

    private StudentRecord roster(UUID id, String number, String name, String team) {
        StudentRecord record = mock(StudentRecord.class);
        when(record.getId()).thenReturn(id);
        when(record.getWorkspaceId()).thenReturn(workspaceId);
        when(record.getStudentNumber()).thenReturn(number);
        when(record.getStudentName()).thenReturn(name);
        when(record.getTeamCode()).thenReturn(team);
        return record;
    }
}
