package com.capvault.backend.template;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.capvault.backend.drive.DriveFileMetadata;
import com.capvault.backend.drive.DriveFileReference;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.drive.GoogleDriveGateway;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DocumentCheckPolicy;

/**
 * Official templates are stored durably in PostgreSQL. The legacy local
 * filesystem path is only a provenance hint: production never reads template
 * bytes from disk, and rows migrated from the local era are marked explicitly
 * unavailable until they are replaced.
 */
@Service
public class DocumentTemplateService {

    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String DOCX_CONTENT_TYPE =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private final DocumentTemplateRepository repository;
    private final DocumentTextExtractor textExtractor;
    private final TemplateStorageProperties properties;
    private final GoogleDriveGateway driveGateway;
    private final DeliverableRepository deliverableRepository;
    private final DeliverableFieldRepository fieldRepository;

    public DocumentTemplateService(
        DocumentTemplateRepository repository,
        DocumentTextExtractor textExtractor,
        TemplateStorageProperties properties,
        GoogleDriveGateway driveGateway,
        DeliverableRepository deliverableRepository,
        DeliverableFieldRepository fieldRepository
    ) {
        this.repository = repository;
        this.textExtractor = textExtractor;
        this.properties = properties;
        this.driveGateway = driveGateway;
        this.deliverableRepository = deliverableRepository;
        this.fieldRepository = fieldRepository;
    }

    @Transactional(readOnly = true)
    public List<DocumentTemplateResponse> list(UUID workspaceId) {
        return repository.findAllByWorkspaceIdOrderByDeliverableKeyAsc(workspaceId)
            .stream()
            .map(DocumentTemplateResponse::from)
            .toList();
    }

    @Transactional
    public DocumentTemplateResponse save(
        UUID workspaceId,
        String deliverableKey,
        String displayName,
        MultipartFile file
    ) {
        return save(workspaceId, deliverableKey, null, displayName, file);
    }

    @Transactional
    public DocumentTemplateResponse save(
        UUID workspaceId,
        String deliverableKey,
        String fieldId,
        String displayName,
        MultipartFile file
    ) {
        validateCommon(workspaceId, deliverableKey, displayName);
        validateFieldAssociation(workspaceId, deliverableKey, fieldId);
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Choose a DOCX or PDF template file.");
        }
        if (file.getSize() > properties.maximumFileSizeBytes()) {
            throw new IllegalArgumentException("The template exceeds the 15 MB upload limit.");
        }

        String originalFilename = safeFilename(file.getOriginalFilename());
        String contentType = normalizeContentType(file.getContentType(), originalFilename);
        validateFileType(originalFilename, contentType);
        return saveBytes(
            workspaceId,
            deliverableKey,
            normalizeNullable(fieldId),
            displayName,
            originalFilename,
            contentType,
            readBytes(file),
            null
        );
    }

    @Transactional
    public DocumentTemplateResponse saveFromDrive(
        UUID workspaceId,
        String deliverableKey,
        String displayName,
        String driveUrl
    ) {
        return saveFromDrive(workspaceId, deliverableKey, null, displayName, driveUrl);
    }

    @Transactional
    public DocumentTemplateResponse saveFromDrive(
        UUID workspaceId,
        String deliverableKey,
        String fieldId,
        String displayName,
        String driveUrl
    ) {
        validateWorkspaceAndDeliverable(workspaceId, deliverableKey);
        validateFieldAssociation(workspaceId, deliverableKey, fieldId);
        if (!driveGateway.isConfigured()) {
            throw new IllegalStateException("Google Drive API is not configured.");
        }

        DriveFileReference reference = DriveLinkParser.parse(driveUrl);
        DriveFileMetadata metadata = driveGateway.getMetadata(reference);
        if (!metadata.canDownload()) {
            throw new IllegalArgumentException("The Google Drive template does not allow downloads.");
        }
        if (metadata.size() != null && metadata.size() > properties.maximumFileSizeBytes()) {
            throw new IllegalArgumentException("The template exceeds the 15 MB limit.");
        }

        String originalFilename = safeFilename(metadata.name());
        String resolvedDisplayName = displayName == null || displayName.isBlank()
            ? filenameToDisplayName(originalFilename)
            : displayName;
        String contentType = normalizeContentType(metadata.mimeType(), originalFilename);
        validateFileType(originalFilename, contentType);
        byte[] bytes = driveGateway.download(reference);
        if (bytes.length == 0) {
            throw new IllegalArgumentException("The Google Drive template is empty.");
        }
        if (bytes.length > properties.maximumFileSizeBytes()) {
            throw new IllegalArgumentException("The template exceeds the 15 MB limit.");
        }

        return saveBytes(
            workspaceId,
            deliverableKey,
            normalizeNullable(fieldId),
            resolvedDisplayName,
            originalFilename,
            contentType,
            bytes,
            "drive:" + reference.fileId()
        );
    }

    @Transactional(readOnly = true)
    public TemplateFile readFile(UUID workspaceId, UUID templateId) {
        DocumentTemplate template = findById(workspaceId, templateId);
        if (!template.isBytesAvailable() || template.getContentBytes() == null) {
            throw new IllegalStateException(
                "This template's stored file was migrated from the previous local storage era and is no longer available. Replace the template to restore Document Checks."
            );
        }
        return new TemplateFile(
            template.getContentBytes(),
            template.getOriginalFilename(),
            template.getContentType()
        );
    }

    @Transactional
    public void delete(UUID workspaceId, UUID templateId) {
        DocumentTemplate template = findById(workspaceId, templateId);
        repository.delete(template);
    }

    @Transactional(readOnly = true)
    public DocumentTemplate find(UUID workspaceId, String deliverableKey) {
        return repository.findByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldIdIsNull(workspaceId, deliverableKey)
            .orElse(null);
    }

    @Transactional(readOnly = true)
    public DocumentTemplate find(UUID workspaceId, String deliverableKey, String fieldId) {
        String normalizedField = normalizeNullable(fieldId);
        if (normalizedField != null) {
            return repository
                .findByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldId(workspaceId, deliverableKey, normalizedField)
                .orElse(null);
        }
        return find(workspaceId, deliverableKey);
    }

    private DocumentTemplateResponse saveBytes(
        UUID workspaceId,
        String deliverableKey,
        String fieldId,
        String displayName,
        String originalFilename,
        String contentType,
        byte[] bytes,
        String provenance
    ) {
        String extractedText = textExtractor.extract(bytes, originalFilename, contentType);
        if (extractedText.length() < 50) {
            throw new IllegalArgumentException(
                "The template contains too little readable text for a useful comparison."
            );
        }

        DocumentTemplate existing = fieldId == null
            ? repository.findByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldIdIsNull(workspaceId, deliverableKey.trim()).orElse(null)
            : repository.findByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldId(workspaceId, deliverableKey.trim(), fieldId).orElse(null);
        String sha256 = sha256(bytes);

        DocumentTemplate template;
        if (existing == null) {
            template = new DocumentTemplate(
                workspaceId,
                deliverableKey.trim(),
                fieldId,
                displayName.trim(),
                originalFilename,
                contentType,
                bytes,
                provenance,
                sha256,
                extractedText
            );
        } else {
            existing.replace(
                displayName.trim(),
                originalFilename,
                contentType,
                bytes,
                provenance,
                sha256,
                extractedText
            );
            template = existing;
        }

        return DocumentTemplateResponse.from(repository.save(template));
    }

    private DocumentTemplate findById(UUID workspaceId, UUID templateId) {
        return repository.findById(templateId)
            .filter(item -> item.getWorkspaceId().equals(workspaceId))
            .orElseThrow(() -> new IllegalArgumentException("Template was not found."));
    }

    private void validateCommon(UUID workspaceId, String deliverableKey, String displayName) {
        validateWorkspaceAndDeliverable(workspaceId, deliverableKey);
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("Template name is required.");
        }
    }

    private void validateWorkspaceAndDeliverable(UUID workspaceId, String deliverableKey) {
        if (workspaceId == null) {
            throw new IllegalArgumentException("Workspace is required.");
        }
        if (deliverableKey == null || deliverableKey.isBlank()) {
            throw new IllegalArgumentException("Deliverable is required.");
        }
    }

    private void validateFieldAssociation(UUID workspaceId, String deliverableKey, String fieldId) {
        String normalizedFieldId = normalizeNullable(fieldId);
        if (normalizedFieldId == null) return;
        Deliverable deliverable = deliverableRepository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId).stream()
            .filter(item -> matchesDeliverableKey(deliverableKey, item))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Template deliverable was not found in this workspace."));
        var field = fieldRepository.findByIdAndDeliverableId(normalizedFieldId, deliverable.getId())
            .orElseThrow(() -> new IllegalArgumentException("Template field does not belong to this deliverable."));
        if (!field.isActive()
            || field.getFieldType() != DeliverableFieldType.DRIVE_PDF
            || field.getDocumentCheckPolicy() == DocumentCheckPolicy.OFF) {
            throw new IllegalArgumentException("Templates are only available for active PDF fields with Document Check enabled.");
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

    private void validateFileType(String filename, String contentType) {
        String lowerName = filename.toLowerCase(Locale.ROOT);
        boolean supportedName = lowerName.endsWith(".pdf") || lowerName.endsWith(".docx");
        boolean supportedType = PDF_CONTENT_TYPE.equalsIgnoreCase(contentType)
            || DOCX_CONTENT_TYPE.equalsIgnoreCase(contentType);
        if (!supportedName && !supportedType) {
            throw new IllegalArgumentException("Use a DOCX or PDF template.");
        }
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new IllegalArgumentException("The template upload could not be read.");
        }
    }

    private static String normalizeContentType(String contentType, String filename) {
        if (contentType != null && !contentType.isBlank() && !"application/octet-stream".equalsIgnoreCase(contentType)) {
            return contentType;
        }
        return filename.toLowerCase(Locale.ROOT).endsWith(".pdf") ? PDF_CONTENT_TYPE : DOCX_CONTENT_TYPE;
    }

    private static String filenameToDisplayName(String filename) {
        String withoutExtension = filename.replaceFirst("(?i)\\.(docx|pdf)$", "");
        String readable = withoutExtension.replaceAll("[_-]+", " ").replaceAll("\\s+", " ").trim();
        return readable.isBlank() ? "Official template" : readable;
    }

    private static String safeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "template.docx";
        }
        String clean = filename.replace('\\', '/');
        int lastSlash = clean.lastIndexOf('/');
        if (lastSlash >= 0) {
            clean = clean.substring(lastSlash + 1);
        }
        clean = clean.trim();
        return clean.isBlank() ? "template.docx" : clean;
    }

    private static String normalizeNullable(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    public record TemplateFile(byte[] bytes, String filename, String contentType) {
    }
}
