package com.capvault.backend.filecheck;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.drive.GoogleDriveProperties;
import com.capvault.backend.drive.GoogleDriveUnavailableException;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.template.DocumentTemplate;
import com.capvault.backend.template.DocumentTemplateService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FileCheckService {

    private static final String PDF_MIME_TYPE = "application/pdf";

    private final GoogleDriveGateway driveGateway;
    private final GoogleDriveProperties driveProperties;
    private final PdfInspector pdfInspector;
    private final TemplateComparator templateComparator;
    private final DocumentTemplateService templateService;
    private final FileCheckReportRepository repository;
    private final FormResponseRepository responseRepository;
    private final DeliverableRepository deliverableRepository;
    private final DeliverableFieldRepository fieldRepository;
    private final ObjectMapper objectMapper;
    private final FileCheckProperties properties;

    public FileCheckService(
        GoogleDriveGateway driveGateway,
        GoogleDriveProperties driveProperties,
        PdfInspector pdfInspector,
        TemplateComparator templateComparator,
        DocumentTemplateService templateService,
        FileCheckReportRepository repository,
        FormResponseRepository responseRepository,
        DeliverableRepository deliverableRepository,
        DeliverableFieldRepository fieldRepository,
        ObjectMapper objectMapper,
        FileCheckProperties properties
    ) {
        this.driveGateway = driveGateway;
        this.driveProperties = driveProperties;
        this.pdfInspector = pdfInspector;
        this.templateComparator = templateComparator;
        this.templateService = templateService;
        this.repository = repository;
        this.responseRepository = responseRepository;
        this.deliverableRepository = deliverableRepository;
        this.fieldRepository = fieldRepository;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Transactional
    public FileCheckResponse check(UUID workspaceId, FileCheckRequest request) {
        LocalDateTime checkedAt = LocalDateTime.now();
        if (request.fieldId() != null) {
            validateFieldAssociation(workspaceId, request);
        }
        if (!driveGateway.isConfigured()) {
            return persist(workspaceId, request, unavailable(request, checkedAt));
        }

        DriveFileReference reference;
        try {
            reference = DriveLinkParser.parse(request.sourceUrl());
        } catch (IllegalArgumentException exception) {
            return persist(workspaceId, request, blocked(
                request,
                checkedAt,
                exception.getMessage(),
                "Invalid Drive Link",
                "Use the Google Drive sharing link for the submitted PDF.",
                null
            ));
        }

        DriveFileMetadata metadata;
        try {
            metadata = driveGateway.getMetadata(reference);
        } catch (GoogleDriveUnavailableException exception) {
            return persist(workspaceId, request, blocked(
                request,
                checkedAt,
                exception.getMessage(),
                "Inaccessible",
                "Set the file to Anyone with the link - Viewer, allow downloads, then run the check again.",
                null
            ));
        }

        FileCheckResponse.DriveMetadata responseMetadata = metadata(metadata);
        if (!PDF_MIME_TYPE.equalsIgnoreCase(metadata.mimeType())) {
            return persist(workspaceId, request, blocked(
                request,
                checkedAt,
                "The Drive file opens, but its MIME type is not PDF.",
                "Not PDF",
                "Upload the frozen PDF to Drive and submit that file's sharing link.",
                responseMetadata
            ));
        }
        if (!metadata.canDownload()) {
            return persist(workspaceId, request, blocked(
                request,
                checkedAt,
                "The Drive file is visible, but its owner disabled downloading.",
                "Download Disabled",
                "Allow viewers to download the PDF, then run the check again.",
                responseMetadata
            ));
        }
        if (metadata.size() != null && metadata.size() > driveProperties.maximumFileSizeBytes()) {
            return persist(workspaceId, request, blocked(
                request,
                checkedAt,
                "The submitted PDF exceeds the 25 MB file-check limit.",
                "File Too Large",
                "Compress the PDF before submitting it.",
                responseMetadata
            ));
        }

        byte[] bytes;
        try {
            bytes = driveGateway.download(reference);
        } catch (GoogleDriveUnavailableException | IllegalArgumentException exception) {
            return persist(workspaceId, request, blocked(
                request,
                checkedAt,
                exception.getMessage(),
                "Download Failed",
                "Confirm the sharing and download permissions, then run the check again.",
                responseMetadata
            ));
        }

        PdfInspection inspection = pdfInspector.inspect(bytes);
        if (!inspection.readable()) {
            String flag = inspection.encrypted() ? "Password Protected" : "Corrupt PDF";
            return persist(workspaceId, request, blocked(
                request,
                checkedAt,
                inspection.error(),
                flag,
                inspection.encrypted()
                    ? "Remove the PDF password and submit a readable copy."
                    : "Export the document as a new PDF and submit the replacement link.",
                responseMetadata
            ));
        }

        DocumentTemplate template = templateService.find(workspaceId, request.deliverableKey(), request.fieldId());
        TemplateComparison comparison = template == null
            ? TemplateComparison.unavailable()
            : templateComparator.compare(template.getExtractedText(), inspection.extractedText());
        return persist(workspaceId, request, completed(
            request,
            checkedAt,
            responseMetadata,
            inspection,
            comparison
        ));
    }

    private void validateFieldAssociation(UUID workspaceId, FileCheckRequest request) {
        UUID responseId;
        try {
            responseId = UUID.fromString(request.responseId());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Field-specific Document Check requires a valid response ID.");
        }

        FormResponse response = responseRepository.findById(responseId)
            .filter(item -> workspaceId.equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Response was not found in this workspace."));
        Deliverable deliverable = deliverableRepository.findById(response.getDeliverableId())
            .filter(item -> workspaceId.equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Response deliverable was not found in this workspace."));
        DeliverableField field = fieldRepository.findByIdAndDeliverableId(request.fieldId().trim(), deliverable.getId())
            .orElseThrow(() -> new IllegalArgumentException("Document Check field does not belong to this response deliverable."));

        if (!field.isActive()
            || field.getFieldType() != DeliverableFieldType.DRIVE_PDF
            || field.getDocumentCheckPolicy() == DocumentCheckPolicy.OFF) {
            throw new IllegalArgumentException("This response field is not enabled for Document Check.");
        }
        if (!matchesDeliverableKey(request.deliverableKey(), deliverable)) {
            throw new IllegalArgumentException("Document Check deliverable does not match the response deliverable.");
        }

        String submittedUrl;
        try {
            var values = objectMapper.readTree(response.getValuesJson());
            var submittedValue = values == null ? null : values.get(field.getFieldKey());
            submittedUrl = submittedValue == null || submittedValue.isNull() ? "" : submittedValue.asText("").trim();
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("The saved response values could not be read.", exception);
        }
        if (submittedUrl.isBlank() || !submittedUrl.equals(request.sourceUrl().trim())) {
            throw new IllegalArgumentException("Document Check source does not match the submitted value for this field.");
        }
    }

    private static boolean matchesDeliverableKey(String requestedKey, Deliverable deliverable) {
        String normalized = requestedKey == null ? "" : requestedKey.trim();
        return equalsIgnoreCase(normalized, deliverable.getTrackerColumnKey())
            || equalsIgnoreCase(normalized, deliverable.getTitle());
    }

    private static boolean equalsIgnoreCase(String left, String right) {
        return right != null && !right.isBlank() && left.equalsIgnoreCase(right.trim());
    }

    @Transactional(readOnly = true)
    public FileCheckResponse latest(UUID workspaceId, String responseId) {
        return findLatest(workspaceId, responseId)
            .orElseThrow(() -> new IllegalArgumentException("No Document Check exists for this response."));
    }

    @Transactional(readOnly = true)
    public java.util.Map<String, FileCheckResponse> latestForResponses(UUID workspaceId, List<String> ids) {
        java.util.Map<String, FileCheckResponse> reports = new java.util.LinkedHashMap<>();
        if (!ids.isEmpty()) repository.findLatestForResponses(workspaceId, ids)
            .stream().filter(report -> report.getFieldId() == null)
            .forEach(report -> reports.putIfAbsent(report.getExternalResponseId(), deserialize(report)));
        return reports;
    }

    @Transactional(readOnly = true)
    public java.util.Map<String, java.util.Map<String, FileCheckResponse>> latestByFieldForResponses(UUID workspaceId, List<String> ids) {
        java.util.Map<String, java.util.Map<String, FileCheckResponse>> reports = new java.util.LinkedHashMap<>();
        if (ids.isEmpty()) return reports;
        repository.findLatestForResponses(workspaceId, ids).stream()
            .filter(report -> report.getFieldId() != null)
            .forEach(report -> reports.computeIfAbsent(report.getExternalResponseId(), ignored -> new java.util.LinkedHashMap<>())
                .putIfAbsent(report.getFieldId(), deserialize(report)));
        return reports;
    }

    @Transactional(readOnly = true)
    public java.util.Optional<FileCheckResponse> findLatest(UUID workspaceId, String responseId) {
        return repository.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdIsNullOrderByCheckedAtDesc(workspaceId, responseId)
            .map(this::deserialize);
    }

    @Transactional(readOnly = true)
    public java.util.Optional<FileCheckResponse> findLatest(UUID workspaceId, String responseId, String fieldId) {
        if (fieldId == null || fieldId.isBlank()) return findLatest(workspaceId, responseId);
        return repository.findFirstByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(workspaceId, responseId, fieldId)
            .map(this::deserialize);
    }

    @Transactional(readOnly = true)
    public List<FileCheckResponse> history(UUID workspaceId, String responseId) {
        return repository.findAllByWorkspaceIdAndExternalResponseIdAndFieldIdIsNullOrderByCheckedAtDesc(workspaceId, responseId)
            .stream()
            .map(this::deserialize)
            .toList();
    }

    @Transactional(readOnly = true)
    public List<FileCheckResponse> history(UUID workspaceId, String responseId, String fieldId) {
        if (fieldId == null || fieldId.isBlank()) return history(workspaceId, responseId);
        return repository.findAllByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(workspaceId, responseId, fieldId)
            .stream().map(this::deserialize).toList();
    }

    public DriveConnectionStatus connectionStatus() {
        return driveGateway.isConfigured()
            ? new DriveConnectionStatus(true, "Google Drive API is connected for Document Check.")
            : new DriveConnectionStatus(
                false,
                "Google Drive API is not configured. Run setup-local.ps1 and restart the backend."
            );
    }

    private FileCheckResponse completed(
        FileCheckRequest request,
        LocalDateTime checkedAt,
        FileCheckResponse.DriveMetadata metadata,
        PdfInspection inspection,
        TemplateComparison comparison
    ) {
        List<String> flags = new ArrayList<>();
        List<String> redFlags = new ArrayList<>();
        List<String> missingSections = new ArrayList<>();
        flags.add("PDF Verified");

        if (inspection.extractedCharacterCount() < properties.minimumReadableCharacters()) {
            flags.add("Too Short");
            redFlags.add("Too Short");
        }
        if (comparison.available()) {
            if (comparison.appearsTemplateOnly()) {
                flags.add("Template-like");
                redFlags.add("Template-like");
            }
            if (!comparison.missingTemplateHeadings().isEmpty()) {
                flags.add("Template Headings Missing");
                missingSections.addAll(comparison.missingTemplateHeadings());
            }
        } else {
            flags.add("No Template");
        }

        boolean attention = !redFlags.isEmpty() || !missingSections.isEmpty();
        String summary;
        if (inspection.extractedCharacterCount() < properties.minimumReadableCharacters()) {
            summary = "The PDF is readable, but it contains very little extractable text.";
        } else if (comparison.appearsTemplateOnly()) {
            summary = "The PDF is readable, but most detected content overlaps the official template and little new content was found.";
        } else if (!missingSections.isEmpty()) {
            summary = "The PDF is readable, but some headings from the official template were not detected.";
        } else if (!comparison.available()) {
            summary = "The PDF is readable. Upload an official template to enable instruction and template comparison.";
        } else {
            summary = "The PDF is readable and contains substantial content beyond the official template.";
        }

        return new FileCheckResponse(
            null,
            request.responseId(),
            request.fieldId(),
            request.sourceUrl(),
            request.sourceResponseUpdatedAt(),
            "COMPLETED",
            attention,
            summary,
            List.copyOf(flags),
            List.copyOf(redFlags),
            List.copyOf(missingSections),
            attention
                ? "Open the submitted file and review the highlighted findings."
                : "The automated checks found no immediate file-access or template-content issue. Staff review is still required.",
            metadata,
            new FileCheckResponse.DocumentResult(
                true,
                false,
                inspection.pageCount(),
                inspection.extractedCharacterCount()
            ),
            comparison,
            "Document Check",
            checkedAt
        );
    }

    private FileCheckResponse unavailable(FileCheckRequest request, LocalDateTime checkedAt) {
        return new FileCheckResponse(
            null,
            request.responseId(),
            request.fieldId(),
            request.sourceUrl(),
            request.sourceResponseUpdatedAt(),
            "UNAVAILABLE",
            false,
            "Google Drive API is not configured on this machine.",
            List.of("Not Checked"),
            List.of(),
            List.of(),
            "Run setup-local.ps1, restart the backend, and try again.",
            null,
            null,
            TemplateComparison.unavailable(),
            "Not checked",
            checkedAt
        );
    }

    private FileCheckResponse blocked(
        FileCheckRequest request,
        LocalDateTime checkedAt,
        String summary,
        String flag,
        String suggestedAction,
        FileCheckResponse.DriveMetadata metadata
    ) {
        return new FileCheckResponse(
            null,
            request.responseId(),
            request.fieldId(),
            request.sourceUrl(),
            request.sourceResponseUpdatedAt(),
            "BLOCKED",
            true,
            summary,
            List.of(flag),
            List.of(flag),
            List.of(),
            suggestedAction,
            metadata,
            null,
            TemplateComparison.unavailable(),
            "Document Check",
            checkedAt
        );
    }

    private FileCheckResponse persist(
        UUID workspaceId,
        FileCheckRequest request,
        FileCheckResponse response
    ) {
        try {
            String json = objectMapper.writeValueAsString(response);
            FileCheckReport saved = repository.save(new FileCheckReport(workspaceId, request, response, json));
            FileCheckResponse withId = response.withId(saved.getId());
            return withId;
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("The file-check report could not be saved.", exception);
        }
    }

    private FileCheckResponse deserialize(FileCheckReport report) {
        try {
            FileCheckResponse response = objectMapper.readValue(report.getReportJson(), FileCheckResponse.class);
            return response.withId(report.getId());
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("A saved file-check report could not be read.", exception);
        }
    }

    private static FileCheckResponse.DriveMetadata metadata(DriveFileMetadata metadata) {
        return new FileCheckResponse.DriveMetadata(
            metadata.id(),
            metadata.name(),
            metadata.mimeType(),
            metadata.size(),
            metadata.md5Checksum(),
            metadata.modifiedTime(),
            metadata.canDownload(),
            metadata.webViewLink()
        );
    }
}
