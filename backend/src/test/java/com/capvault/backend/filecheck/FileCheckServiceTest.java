package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

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
import org.springframework.test.util.ReflectionTestUtils;

class FileCheckServiceTest {

    @Test
    void fieldSpecificCheckDoesNotFallBackToLegacyOrAnotherArtifactTemplate() {
        UUID workspaceId = UUID.randomUUID();
        String deliverableKey = "MVP Validation";
        String fieldId = "framework-pdf";
        String otherFieldId = "highlights-pdf";
        String sourceUrl = "https://drive.google.com/file/d/framework-file/view";
        UUID responseId = UUID.randomUUID();
        UUID deliverableId = UUID.randomUUID();

        GoogleDriveGateway driveGateway = mock(GoogleDriveGateway.class);
        PdfInspector pdfInspector = mock(PdfInspector.class);
        DocumentTemplateService templateService = mock(DocumentTemplateService.class);
        FileCheckReportRepository repository = mock(FileCheckReportRepository.class);
        FormResponseRepository responseRepository = mock(FormResponseRepository.class);
        DeliverableRepository deliverableRepository = mock(DeliverableRepository.class);
        DeliverableFieldRepository fieldRepository = mock(DeliverableFieldRepository.class);
        FileCheckProperties properties = new FileCheckProperties(100, 0.85, 0.15);

        Deliverable deliverable = new Deliverable(
            workspaceId, deliverableKey, "MVP Validation", "mvp-validation", "", LocalDateTime.now(), true,
            DeliverableStatus.PUBLISHED
        );
        ReflectionTestUtils.setField(deliverable, "id", deliverableId);
        DeliverableField field = new DeliverableField(
            fieldId, deliverableId, "frameworkModel", "Framework / Model", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.MANUAL, true, true
        );
        FormResponse response = new FormResponse(
            responseId, workspaceId, deliverableId, "subject", "student@example.com", UUID.randomUUID(),
            "20260001", "Student", "TEAM-1", "{\"frameworkModel\":\"" + sourceUrl + "\"}", Instant.now(), Instant.now()
        );
        when(responseRepository.findById(responseId)).thenReturn(Optional.of(response));
        when(deliverableRepository.findById(deliverableId)).thenReturn(Optional.of(deliverable));
        when(fieldRepository.findByIdAndDeliverableId(fieldId, deliverableId)).thenReturn(Optional.of(field));

        DriveFileReference reference = new DriveFileReference("framework-file", null);
        when(driveGateway.isConfigured()).thenReturn(true);
        when(driveGateway.getMetadata(reference)).thenReturn(new DriveFileMetadata(
            "framework-file",
            "framework.pdf",
            "application/pdf",
            1024L,
            "checksum",
            OffsetDateTime.parse("2026-09-11T00:00:00Z"),
            true,
            sourceUrl
        ));
        when(driveGateway.download(reference)).thenReturn(new byte[] {1, 2, 3});
        when(pdfInspector.inspect(any(byte[].class))).thenReturn(new PdfInspection(
            true,
            false,
            4,
            500,
            "A completed framework submission with enough readable content for checking.",
            null
        ));

        DocumentTemplate legacyTemplate = mock(DocumentTemplate.class);
        DocumentTemplate otherTemplate = mock(DocumentTemplate.class);
        when(templateService.find(workspaceId, deliverableKey)).thenReturn(legacyTemplate);
        when(templateService.find(workspaceId, deliverableKey, otherFieldId)).thenReturn(otherTemplate);
        when(templateService.find(workspaceId, deliverableKey, fieldId)).thenReturn(null);
        when(repository.save(any(FileCheckReport.class))).thenAnswer(invocation -> invocation.getArgument(0));

        FileCheckService service = new FileCheckService(
            driveGateway,
            new GoogleDriveProperties(true, "test-key", 25_000_000),
            pdfInspector,
            new TemplateComparator(properties),
            templateService,
            repository,
            responseRepository,
            deliverableRepository,
            fieldRepository,
            new ObjectMapper().findAndRegisterModules(),
            properties
        );

        FileCheckResponse result = service.check(workspaceId, new FileCheckRequest(
            responseId.toString(),
            fieldId,
            deliverableKey,
            sourceUrl,
            "2026-09-11T05:00:00+08:00"
        ));

        assertThat(result.status()).isEqualTo("COMPLETED");
        assertThat(result.fieldId()).isEqualTo(fieldId);
        assertThat(result.flags()).contains("No Template");
        assertThat(result.templateComparison().available()).isFalse();
        verify(templateService).find(workspaceId, deliverableKey, fieldId);
        verify(templateService, never()).find(workspaceId, deliverableKey);
        verify(templateService, never()).find(workspaceId, deliverableKey, otherFieldId);
    }
}
