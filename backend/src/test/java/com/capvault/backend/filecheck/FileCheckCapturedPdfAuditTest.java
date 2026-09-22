package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

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
import com.capvault.backend.drive.GoogleDriveUnavailableException;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.template.DocumentTemplate;
import com.capvault.backend.template.DocumentTemplateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class FileCheckCapturedPdfAuditTest {
    private static final String KEY = "SRS-TRACKER";
    private static final String TITLE = "Software Requirements Specification";
    private static final String PDF = "https://drive.google.com/file/d/shared-pdf/view";
    private final UUID workspace = UUID.randomUUID();
    private final UUID deliverableId = UUID.randomUUID();
    private final GoogleDriveGateway drive = mock(GoogleDriveGateway.class);
    private final PdfInspector pdfInspector = mock(PdfInspector.class);
    private final DocumentTemplateService templates = mock(DocumentTemplateService.class);
    private final FileCheckReportRepository reports = mock(FileCheckReportRepository.class);
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final DeliverableRepository deliverables = mock(DeliverableRepository.class);
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
    private final FileCheckProperties settings = new FileCheckProperties(100, .85, .15);
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final FileCheckService service = new FileCheckService(drive,
        new GoogleDriveProperties(true, "fake-key", 25_000_000), pdfInspector,
        new TemplateComparator(settings), templates, reports, responses, deliverables, fields, mapper, settings);

    private void deliverableAndFields() {
        var deliverable = new Deliverable(workspace, KEY, TITLE, "srs", "",
            LocalDateTime.now().plusDays(1), true, DeliverableStatus.PUBLISHED);
        ReflectionTestUtils.setField(deliverable, "id", deliverableId);
        when(deliverables.findById(deliverableId)).thenReturn(Optional.of(deliverable));
        for (String id : List.of("framework-field", "highlights-field")) {
            String fieldKey = id.equals("framework-field") ? "frameworkPdf" : "highlightsPdf";
            var field = new DeliverableField(id, deliverableId, fieldKey, fieldKey,
                DeliverableFieldType.DRIVE_PDF, true, 0, DocumentCheckPolicy.AUTO, true, true);
            when(fields.findByIdAndDeliverableId(id, deliverableId)).thenReturn(Optional.of(field));
        }
        when(reports.save(any(FileCheckReport.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private FormResponse submission(UUID id, UUID scope, String values, Instant updated) {
        var response = new FormResponse(id, scope, deliverableId, "student-subject", "student@example.invalid",
            UUID.randomUUID(), "20260001", "Fictional", "TEAM-1", values, updated.minusSeconds(90), updated);
        when(responses.findById(id)).thenReturn(Optional.of(response));
        return response;
    }

    private static FileCheckRequest check(UUID id, String field, String url, String key, String timestamp) {
        return new FileCheckRequest(id.toString(), field, key, url, timestamp);
    }

    private static DriveFileMetadata metadata(String fileId, long size, String md5) {
        return new DriveFileMetadata(fileId, "shared.pdf", "application/pdf", size, md5,
            OffsetDateTime.parse("2026-09-22T00:00:00Z"), "editor-private@example.invalid",
            "Private Editor", true, PDF);
    }

    private static String md5(byte[] bytes) throws Exception {
        return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(bytes));
    }

    @Test
    void canonicalizesClientAliasAndTimestampToSavedResponseAndRejectsForgedTargets() {
        deliverableAndFields();
        Instant savedAt = Instant.parse("2026-09-22T01:02:03Z");
        UUID id = UUID.randomUUID();
        submission(id, workspace, "{\"frameworkPdf\":\"" + PDF + "\"}", savedAt);
        var client = check(id, "framework-field", PDF, TITLE, "2099-01-01T00:00:00Z");

        FileCheckRequest validated = service.validateBatchTarget(workspace, client);
        assertThat(validated.deliverableKey()).isEqualTo(KEY);
        assertThat(validated.sourceResponseUpdatedAt()).isEqualTo(savedAt.toString());
        assertThat(validated.sourceUrl()).isEqualTo(PDF);
        assertThatThrownBy(() -> service.validateBatchTarget(workspace,
            check(id, "framework-field", "https://drive.google.com/file/d/forged/view", KEY, "time")))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("does not match");
        assertThatThrownBy(() -> service.validateBatchTarget(workspace,
            check(id, "highlights-field", PDF, KEY, "time")))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("does not match");
        assertThatThrownBy(() -> service.validateBatchTarget(workspace,
            check(id, "framework-field", PDF, "WRONG-DELIVERABLE", "time")))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("deliverable does not match");
        assertThatThrownBy(() -> service.validateBatchTarget(UUID.randomUUID(), client))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("not found in this workspace");
        verifyNoInteractions(drive, pdfInspector, templates);
        verify(reports, never()).save(any());
    }

    @Test
    void reusesOneVerifiedCaptureWhileEachResponseAndFieldReceivesItsOwnTemplateComparisonAndReport() throws Exception {
        deliverableAndFields();
        when(drive.isConfigured()).thenReturn(true);
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        Instant firstSaved = Instant.parse("2026-09-22T01:00:00Z");
        Instant secondSaved = Instant.parse("2026-09-22T02:00:00Z");
        String values = "{\"frameworkPdf\":\"" + PDF + "\",\"highlightsPdf\":\"" + PDF + "\"}";
        submission(first, workspace, values, firstSaved);
        submission(second, workspace, values, secondSaved);
        DocumentTemplate framework = mock(DocumentTemplate.class);
        DocumentTemplate highlights = mock(DocumentTemplate.class);
        when(framework.getExtractedText()).thenReturn("1 Introduction\n2 Framework methodology\n");
        when(highlights.getExtractedText()).thenReturn("1 Validation highlights\n2 Evidence summary\n");
        when(templates.find(workspace, KEY, "framework-field")).thenReturn(framework);
        when(templates.find(workspace, KEY, "highlights-field")).thenReturn(highlights);
        var ref = new DriveFileReference("shared-pdf", null);
        byte[] bytes = "%PDF-synthetic-testing".getBytes(StandardCharsets.UTF_8);
        var metadata = metadata("shared-pdf", bytes.length, md5(bytes));
        when(drive.download(ref)).thenReturn(bytes);
        when(pdfInspector.inspect(bytes)).thenReturn(new PdfInspection(true, false, 3, 350,
            "1 Introduction\n2 Framework methodology\nThis is a complete fictional report.\n", null));

        var captured = service.capture(ref, metadata);
        FileCheckResponse firstFramework = service.checkCaptured(workspace, service.validateBatchTarget(workspace,
            check(first, "framework-field", PDF, TITLE, "CLIENT-FORGED")), captured);
        FileCheckResponse firstHighlights = service.checkCaptured(workspace, service.validateBatchTarget(workspace,
            check(first, "highlights-field", PDF, KEY, "CLIENT-FORGED")), captured);
        FileCheckResponse secondFramework = service.checkCaptured(workspace, service.validateBatchTarget(workspace,
            check(second, "framework-field", PDF, KEY, "CLIENT-FORGED")), captured);
        FileCheckResponse secondHighlights = service.checkCaptured(workspace, service.validateBatchTarget(workspace,
            check(second, "highlights-field", PDF, KEY, "CLIENT-FORGED")), captured);

        verify(drive, times(1)).download(ref);
        verify(pdfInspector, times(1)).inspect(bytes);
        verify(templates, times(2)).find(workspace, KEY, "framework-field");
        verify(templates, times(2)).find(workspace, KEY, "highlights-field");
        verify(templates, never()).find(workspace, KEY);
        for (FileCheckResponse report : List.of(firstFramework, firstHighlights, secondFramework, secondHighlights)) {
            assertThat(report.status()).isEqualTo("COMPLETED");
            assertThat(report.metadata().fileId()).isEqualTo("shared-pdf");
            assertThat(report.templateComparison().available()).isTrue();
            assertThat(report.sourceResponseUpdatedAt()).isIn(firstSaved.toString(), secondSaved.toString());
        }
        assertThat(firstFramework.fieldId()).isEqualTo("framework-field");
        assertThat(firstHighlights.fieldId()).isEqualTo("highlights-field");
        assertThat(secondFramework.responseId()).isEqualTo(second.toString());
        assertThat(secondHighlights.responseId()).isEqualTo(second.toString());
        assertThat(firstFramework.templateComparison().missingTemplateHeadings())
            .isNotEqualTo(firstHighlights.templateComparison().missingTemplateHeadings());
        var saved = org.mockito.ArgumentCaptor.forClass(FileCheckReport.class);
        verify(reports, times(4)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(FileCheckReport::getExternalResponseId)
            .containsExactly(first.toString(), first.toString(), second.toString(), second.toString());
        assertThat(saved.getAllValues()).extracting(FileCheckReport::getFieldId)
            .containsExactly("framework-field", "highlights-field", "framework-field", "highlights-field");
        assertThat(mapper.writeValueAsString(firstFramework)).doesNotContain("editor-private@example.invalid", "Private Editor");
        assertThat(saved.getAllValues().get(0).getDriveLastModifyingUserEmail())
            .isEqualTo("editor-private@example.invalid");
    }

    @Test
    void rejectsWrongMetadataIdAndChangedOrOversizedDownloadsWithoutProducingAReport() throws Exception {
        deliverableAndFields();
        when(drive.isConfigured()).thenReturn(true);
        UUID id = UUID.randomUUID();
        submission(id, workspace, "{\"frameworkPdf\":\"" + PDF + "\"}", Instant.now());
        var ref = new DriveFileReference("shared-pdf", null);
        byte[] bytes = "%PDF-synthetic-testing".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> service.capture(ref, metadata("wrong-file", bytes.length, md5(bytes))))
            .isInstanceOf(GoogleDriveUnavailableException.class).hasMessageContaining("different or unknown file");
        verify(drive, never()).download(any());

        when(drive.download(ref)).thenReturn(bytes);
        assertThatThrownBy(() -> service.capture(ref, metadata("shared-pdf", bytes.length, "incorrect-md5")))
            .isInstanceOf(GoogleDriveUnavailableException.class).hasMessageContaining("changed during download");
        assertThatThrownBy(() -> service.capture(ref, metadata("shared-pdf", bytes.length + 1, null)))
            .isInstanceOf(GoogleDriveUnavailableException.class).hasMessageContaining("did not match");
        assertThatThrownBy(() -> service.capture(ref, metadata("shared-pdf", 1, null)))
            .isInstanceOf(GoogleDriveUnavailableException.class).hasMessageContaining("did not match");

        var captured = new FileCheckService.CapturedPdf(metadata("wrong-file", 100, null), bytes,
            new PdfInspection(true, false, 3, 350, "fake text", null));
        assertThatThrownBy(() -> service.checkCaptured(workspace,
            check(id, "framework-field", PDF, KEY, "time"), captured))
            .isInstanceOf(GoogleDriveUnavailableException.class).hasMessageContaining("different or unknown file");
        verify(reports, never()).save(any());
    }

    @Test
    void redactsRawProviderExceptionsInPersistedBlockedReportsWithoutInventingMetadata() throws Exception {
        deliverableAndFields();
        UUID id = UUID.randomUUID();
        Instant updatedAt = Instant.parse("2026-09-22T03:00:00Z");
        submission(id, workspace, "{\"frameworkPdf\":\"" + PDF + "\"}", updatedAt);
        var validated = service.validateBatchTarget(workspace,
            check(id, "framework-field", PDF, KEY, "attacker-fabricated-date"));
        var blocked = service.recordBatchProviderFailure(workspace, validated, true,
            "Drive error: key SECRET-NEVER-EXPOSE url https://provider.invalid/private");

        assertThat(blocked.status()).isEqualTo("BLOCKED");
        assertThat(blocked.metadata()).isNull();
        assertThat(blocked.document()).isNull();
        assertThat(blocked.sourceResponseUpdatedAt()).isEqualTo(updatedAt.toString());
        assertThat(mapper.writeValueAsString(blocked)).doesNotContain("SECRET-NEVER-EXPOSE", "provider.invalid");
        var saved = org.mockito.ArgumentCaptor.forClass(FileCheckReport.class);
        verify(reports).save(saved.capture());
        assertThat(saved.getValue().getReportJson()).doesNotContain("SECRET-NEVER-EXPOSE", "provider.invalid");
        assertThat(saved.getValue().getDriveLastModifyingUserEmail()).isNull();
        verifyNoInteractions(drive, pdfInspector, templates);
    }

    @Test
    void refusesToPersistCapturedOrBlockedReportsAfterTheResponseRevisionChangesMidBatch() {
        deliverableAndFields();
        when(drive.isConfigured()).thenReturn(true);
        UUID id = UUID.randomUUID();
        Instant prior = Instant.parse("2026-09-22T02:00:00Z");
        Instant revised = prior.plusSeconds(60);
        var response = submission(id, workspace, "{\"frameworkPdf\":\"" + PDF + "\"}", prior);
        var previouslyValidated = service.validateBatchTarget(workspace,
            check(id, "framework-field", PDF, KEY, "forged"));
        response.setUpdatedAt(revised);
        var capture = new FileCheckService.CapturedPdf(metadata("shared-pdf", 100, null),
            "%PDF-synthetic".getBytes(StandardCharsets.UTF_8),
            new PdfInspection(true, false, 2, 400, "fictional", null));

        assertThatThrownBy(() -> service.checkCaptured(workspace, previouslyValidated, capture))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("response changed");
        assertThatThrownBy(() -> service.recordBatchProviderFailure(workspace, previouslyValidated, true,
            "Drive error with sensitive text"))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("response changed");
        verify(reports, never()).save(any());
        verifyNoInteractions(templates, pdfInspector);
    }
}
