package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Optional;
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
import com.capvault.backend.drive.GoogleDriveProperties;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.template.DocumentTemplate;
import com.capvault.backend.template.DocumentTemplateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class FileCheckSubmissionSubstanceTest {

    @Test
    void noTemplateSubstantialPdfLooksSubstantiallyFilled() throws Exception {
        String text = substantialText(240);
        FileCheckResponse result = harness(new PdfInspection(
            true, false, 4, 4, text.length(), text, ""), null).run();

        assertThat(result.submissionSubstance().state()).isEqualTo("LOOKS_SUBSTANTIALLY_FILLED");
        assertThat(result.submissionSubstance().reason()).contains("No official template");
        assertThat(result.attentionRequired()).isFalse();
        assertThat(result.flags()).contains("No Template");
    }

    @Test
    void noTemplateSparsePdfNeedsAttention() throws Exception {
        String text = "Short planning note. ".repeat(35);
        FileCheckResponse result = harness(new PdfInspection(
            true, false, 5, 5, text.length(), text, ""), null).run();

        assertThat(result.submissionSubstance().state()).isEqualTo("NEEDS_ATTENTION");
        assertThat(result.submissionSubstance().reason()).containsIgnoringCase("extractable text");
        assertThat(result.attentionRequired()).isTrue();
    }

    @Test
    void strongAddedContentPassesEvenWhenTemplateHeadingIsNotDetected() throws Exception {
        String template = templateText();
        String submitted = "1. Introduction\n" + substantialText(300);
        FileCheckResponse result = harness(new PdfInspection(
            true, false, 5, 5, submitted.length(), submitted, ""), template).run();

        assertThat(result.templateComparison().missingTemplateHeadings()).contains("Requirements");
        assertThat(result.submissionSubstance().state()).isEqualTo("LOOKS_SUBSTANTIALLY_FILLED");
        assertThat(result.attentionRequired()).isFalse();
    }

    @Test
    void readablePdfWithoutUsableExtractedTextIsInconclusive() throws Exception {
        FileCheckResponse result = harness(new PdfInspection(
            true, false, 5, 0, 0, "", ""), null).run();

        assertThat(result.submissionSubstance().state()).isEqualTo("COULD_NOT_DETERMINE");
        assertThat(result.submissionSubstance().reason()).containsIgnoringCase("not enough extractable text");
        assertThat(result.attentionRequired()).isTrue();
    }

    private static Harness harness(PdfInspection inspection, String templateText) {
        return new Harness(inspection, templateText);
    }

    private static String substantialText(int words) {
        String[] vocabulary = {
            "request", "workflow", "identity", "validation", "dispatch", "technician", "status", "audit",
            "notification", "schedule", "priority", "evidence", "interface", "reliability", "security", "constraint"
        };
        StringBuilder text = new StringBuilder();
        for (int index = 0; index < words; index++) {
            text.append(vocabulary[index % vocabulary.length]).append(index).append(' ');
        }
        return text.toString();
    }

    private static String templateText() {
        String guidance = "Official template guidance explains the expected project-specific content and must be replaced or expanded by the student. ".repeat(12);
        return """
            Table of Contents
            1. Introduction .......... 1
            2. Requirements .......... 2

            1. Introduction
            %s
            2. Requirements
            %s
            """.formatted(guidance, guidance);
    }

    private static final class Harness {
        private final UUID workspaceId = UUID.randomUUID();
        private final UUID responseId = UUID.randomUUID();
        private final UUID deliverableId = UUID.randomUUID();
        private final String deliverableKey = "Refactored SRS";
        private final String fieldId = "srs-pdf";
        private final String sourceUrl = "https://drive.google.com/file/d/substance-file/view";
        private final GoogleDriveGateway driveGateway = mock(GoogleDriveGateway.class);
        private final PdfInspector pdfInspector = mock(PdfInspector.class);
        private final DocumentTemplateService templateService = mock(DocumentTemplateService.class);
        private final FileCheckReportRepository reportRepository = mock(FileCheckReportRepository.class);
        private final FormResponseRepository responseRepository = mock(FormResponseRepository.class);
        private final DeliverableRepository deliverableRepository = mock(DeliverableRepository.class);
        private final DeliverableFieldRepository fieldRepository = mock(DeliverableFieldRepository.class);
        private final FileCheckProperties properties = new FileCheckProperties(300, 0.75, 0.25);

        private Harness(PdfInspection inspection, String templateText) {
            Deliverable deliverable = new Deliverable(
                workspaceId, deliverableKey, "Refactored SRS", "refactored-srs", "", LocalDateTime.now(), true,
                DeliverableStatus.PUBLISHED);
            ReflectionTestUtils.setField(deliverable, "id", deliverableId);
            DeliverableField field = new DeliverableField(
                fieldId, deliverableId, "srsPdf", "SRS PDF", DeliverableFieldType.DRIVE_PDF,
                true, 0, DocumentCheckPolicy.MANUAL, true, true);
            FormResponse response = new FormResponse(
                responseId, workspaceId, deliverableId, "subject", "student@example.com", UUID.randomUUID(),
                "20260001", "Student", "TEAM-1", "{\"srsPdf\":\"" + sourceUrl + "\"}", Instant.now(), Instant.now());

            when(responseRepository.findById(responseId)).thenReturn(Optional.of(response));
            when(deliverableRepository.findById(deliverableId)).thenReturn(Optional.of(deliverable));
            when(fieldRepository.findByIdAndDeliverableId(fieldId, deliverableId)).thenReturn(Optional.of(field));

            DriveFileReference reference = new DriveFileReference("substance-file", null);
            when(driveGateway.isConfigured()).thenReturn(true);
            when(driveGateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
                "substance-file", "srs.pdf", "application/pdf", 4096L, null,
                OffsetDateTime.parse("2026-09-25T00:00:00Z"), "editor@example.com", "Editor",
                true, sourceUrl));
            when(driveGateway.download(reference)).thenReturn(new byte[] {1, 2, 3});
            when(pdfInspector.inspect(any(byte[].class))).thenReturn(inspection);
            when(reportRepository.save(any(FileCheckReport.class))).thenAnswer(invocation -> invocation.getArgument(0));

            if (templateText == null) {
                when(templateService.find(workspaceId, deliverableKey, fieldId)).thenReturn(null);
            } else {
                DocumentTemplate template = mock(DocumentTemplate.class);
                when(template.getExtractedText()).thenReturn(templateText);
                when(templateService.find(workspaceId, deliverableKey, fieldId)).thenReturn(template);
            }
        }

        private FileCheckResponse run() {
            FileCheckService service = new FileCheckService(
                driveGateway,
                new GoogleDriveProperties(true, "test-key", 25_000_000),
                pdfInspector,
                new TemplateComparator(properties),
                templateService,
                reportRepository,
                responseRepository,
                deliverableRepository,
                fieldRepository,
                new ObjectMapper().findAndRegisterModules(),
                properties);

            return service.check(workspaceId, new FileCheckRequest(
                responseId.toString(), fieldId, deliverableKey, sourceUrl, "2026-09-25T08:00:00+08:00"));
        }
    }
}
