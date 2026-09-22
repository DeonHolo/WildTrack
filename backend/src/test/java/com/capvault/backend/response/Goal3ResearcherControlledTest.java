package com.capvault.backend.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.filecheck.FileCheckRequest;
import com.capvault.backend.filecheck.FileCheckService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Isolated in-memory/H2 research simulations. The response/database, validation,
 * history and PDF parser paths are real production code; the Google Drive gateway
 * is deliberately mocked. No live student, Google account, API or Drive file is used.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class Goal3ResearcherControlledTest {
    private static final String SUBJECT = "synthetic-goal3-researcher-subject";
    private static final String STUDENT = "99-9999-999";
    private static final String PDF_A = "https://drive.google.com/file/d/goal3-fictional-pdf-A/view";
    private static final String PDF_B = "https://drive.google.com/file/d/goal3-fictional-pdf-B/view";
    private static final String DOCX = "https://drive.google.com/file/d/goal3-fictional-docx/view";

    @Autowired FormResponseService responses;
    @Autowired FormResponseRepository responseRepository;
    @Autowired DeliverableRepository deliverables;
    @Autowired DeliverableFieldRepository fields;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentRecordRepository students;
    @Autowired FileCheckService fileCheck;
    @MockBean GoogleDriveGateway drive;

    private UUID workspaceId;
    private UUID deliverableId;

    @BeforeEach
    void isolatedFictionalWorkspaceWithNoValidationStep() {
        AcademicWorkspace workspace = workspaces.save(new AcademicWorkspace(
            "Goal 3 isolated fictional workspace", "IT", "RESEARCH_ONLY", "Semester 1", "2099-2100", true));
        workspaceId = workspace.getId();
        students.save(new StudentRecord(workspaceId, STUDENT, "Fictional Research Student",
            "synthetic-team", "1", "SYNTH", "Fictional Adviser", null, 1));
        Deliverable deliverable = deliverables.save(new Deliverable(workspaceId,
            "Refactored SRS", "Refactored SRS Submission", "goal3-synthetic-srs",
            "Fictional PDF Drive file link", LocalDateTime.of(2099, 9, 30, 23, 59),
            true, DeliverableStatus.PUBLISHED));
        deliverableId = deliverable.getId();
        fields.save(new DeliverableField("goal3-research-only-pdf-" + UUID.randomUUID(), deliverableId,
            "documentPdf", "PDF Drive Link", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.MANUAL, false, true));
        assertThat(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId))
            .extracting(DeliverableField::getFieldKey).containsExactly("documentPdf");
    }

    private FormResponseService.SaveResult save(String url, Long revision) {
        return responses.submit(new FormResponseService.SubmitCommand(workspaceId, deliverableId,
            SUBJECT, "synthetic@example.invalid", STUDENT,
            url == null ? Map.of() : Map.of("documentPdf", url), revision));
    }

    @Test
    void R3_01_blankRequiredPdfCannotCreateSavedResponseOrVersion() {
        long countBefore = responseRepository.count();
        assertThatThrownBy(() -> save(null, null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("PDF Drive Link is required");
        assertThat(responseRepository.count()).isEqualTo(countBefore);
        assertThat(responses.ownedResponse(workspaceId, deliverableId, SUBJECT)).isEmpty();
        assertThatThrownBy(() -> responses.history(workspaceId, deliverableId, SUBJECT))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("No response exists");
    }

    @Test
    void R3_02_docxLinkCanSaveButProviderMimeTypeIsFlaggedNotPdf() {
        var saved = save(DOCX, null);
        assertThat(saved.changed()).isTrue();
        assertThat(saved.response().getValuesJson()).contains("goal3-fictional-docx");
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenReturn(new DriveFileMetadata(
            "goal3-fictional-docx", "fictional-srs.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            512L, "synthetic-checksum", OffsetDateTime.parse("2099-01-01T00:00:00Z"), true, DOCX));

        var report = fileCheck.check(workspaceId, new FileCheckRequest(
            saved.response().getId().toString(), activePdfFieldId(), "Refactored SRS", DOCX,
            saved.response().getUpdatedAt().toString()));

        assertThat(report.status()).isEqualTo("BLOCKED");
        assertThat(report.flags()).contains("Not PDF");
        assertThat(report.metadata().mimeType()).contains("wordprocessingml.document");
        assertThat(report.attentionRequired()).isTrue();
        verify(drive, never()).download(any(DriveFileReference.class));
        assertThat(responses.ownedResponse(workspaceId, deliverableId, SUBJECT)).isPresent();
    }

    @Test
    void R3_03_editingFictionalPdfLinkPreservesIdentityVersionsAndNoOp() throws Exception {
        var initial = save(PDF_A, null);
        UUID originalResponseId = initial.response().getId();
        long originalRevision = initial.clientRevision();
        var originalSubmittedAt = initial.response().getSubmittedAt();
        String originalStudent = initial.response().getStudentNumber();
        UUID originalStudentRecordId = initial.response().getStudentRecordId();
        assertThat(responses.history(workspaceId, deliverableId, SUBJECT)).isEmpty();

        // Real locally generated PDF A and B bytes are parsed; the Drive provider
        // metadata/download gateway is a strictly isolated, deterministic stub.
        byte[] pdfA = fictionalPdf("A");
        byte[] pdfB = fictionalPdf("B");
        when(drive.isConfigured()).thenReturn(true);
        when(drive.getMetadata(any(DriveFileReference.class))).thenAnswer(call -> {
            DriveFileReference reference = call.getArgument(0);
            boolean fileA = "goal3-fictional-pdf-A".equals(reference.fileId());
            return new DriveFileMetadata(reference.fileId(), fileA ? "fictional-A.pdf" : "fictional-B.pdf",
                "application/pdf", (long) (fileA ? pdfA : pdfB).length,
                "synthetic-pdf-checksum", OffsetDateTime.parse("2099-01-01T00:00:00Z"),
                true, fileA ? PDF_A : PDF_B);
        });
        when(drive.download(any(DriveFileReference.class))).thenAnswer(call -> {
            DriveFileReference reference = call.getArgument(0);
            return "goal3-fictional-pdf-A".equals(reference.fileId()) ? pdfA : pdfB;
        });
        var initialCheck = fileCheck.check(workspaceId, new FileCheckRequest(
            originalResponseId.toString(), activePdfFieldId(), "Refactored SRS", PDF_A,
            initial.response().getUpdatedAt().toString()));
        assertThat(initialCheck.status()).isEqualTo("COMPLETED");
        assertThat(initialCheck.document().readable()).isTrue();

        var edited = save(PDF_B, originalRevision);
        assertThat(edited.changed()).isTrue();
        assertThat(edited.response().getId()).isEqualTo(originalResponseId);
        assertThat(edited.response().getRevision()).isGreaterThan(originalRevision);
        assertThat(edited.response().getSubmittedAt()).isEqualTo(originalSubmittedAt);
        assertThat(edited.response().getUpdatedAt()).isAfterOrEqualTo(originalSubmittedAt);
        assertThat(edited.response().getWorkspaceId()).isEqualTo(workspaceId);
        assertThat(edited.response().getDeliverableId()).isEqualTo(deliverableId);
        assertThat(edited.response().getStudentNumber()).isEqualTo(originalStudent);
        assertThat(edited.response().getStudentRecordId()).isEqualTo(originalStudentRecordId);
        assertThat(edited.response().getValuesJson()).contains("goal3-fictional-pdf-B")
            .doesNotContain("goal3-fictional-pdf-A", "validationStep");
        var history = responses.history(workspaceId, deliverableId, SUBJECT);
        assertThat(history).hasSize(1);
        assertThat(history.get(0).get("values").toString()).contains("goal3-fictional-pdf-A");

        assertThatThrownBy(() -> fileCheck.check(workspaceId, new FileCheckRequest(
            originalResponseId.toString(), activePdfFieldId(), "Refactored SRS", PDF_A,
            edited.response().getUpdatedAt().toString())))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("does not match the submitted value");
        var report = fileCheck.check(workspaceId, new FileCheckRequest(
            originalResponseId.toString(), activePdfFieldId(), "Refactored SRS", PDF_B,
            edited.response().getUpdatedAt().toString()));
        assertThat(report.status()).isEqualTo("COMPLETED");
        assertThat(report.sourceUrl()).isEqualTo(PDF_B);
        assertThat(report.flags()).contains("PDF Verified");
        assertThat(report.document().readable()).isTrue();

        var noOp = save(PDF_B, edited.clientRevision());
        assertThat(noOp.changed()).isFalse();
        assertThat(noOp.response().getId()).isEqualTo(originalResponseId);
        assertThat(noOp.clientRevision()).isEqualTo(edited.clientRevision());
        assertThat(noOp.response().getUpdatedAt()).isEqualTo(edited.response().getUpdatedAt());
        assertThat(responses.history(workspaceId, deliverableId, SUBJECT)).hasSize(1);
    }

    private String activePdfFieldId() {
        return fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId).get(0).getId();
    }

    private static byte[] fictionalPdf(String label) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            doc.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(72, 700);
                content.showText("Fictional researcher controlled PDF " + label + ", not a real student submission.");
                content.endText();
            }
            doc.save(output);
            return output.toByteArray();
        }
    }
}
