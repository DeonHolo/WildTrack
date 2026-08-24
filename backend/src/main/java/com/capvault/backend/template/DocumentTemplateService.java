package com.capvault.backend.template;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
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

@Service
public class DocumentTemplateService {

    private static final String PDF_CONTENT_TYPE = "application/pdf";
    private static final String DOCX_CONTENT_TYPE =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private final DocumentTemplateRepository repository;
    private final DocumentTextExtractor textExtractor;
    private final TemplateStorageProperties properties;
    private final GoogleDriveGateway driveGateway;

    public DocumentTemplateService(
        DocumentTemplateRepository repository,
        DocumentTextExtractor textExtractor,
        TemplateStorageProperties properties,
        GoogleDriveGateway driveGateway
    ) {
        this.repository = repository;
        this.textExtractor = textExtractor;
        this.properties = properties;
        this.driveGateway = driveGateway;
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
        validateCommon(workspaceId, deliverableKey, displayName);
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
            displayName,
            originalFilename,
            contentType,
            readBytes(file)
        );
    }

    @Transactional
    public DocumentTemplateResponse saveFromDrive(
        UUID workspaceId,
        String deliverableKey,
        String displayName,
        String driveUrl
    ) {
        validateWorkspaceAndDeliverable(workspaceId, deliverableKey);
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
            resolvedDisplayName,
            originalFilename,
            contentType,
            bytes
        );
    }

    @Transactional(readOnly = true)
    public TemplateFile readFile(UUID workspaceId, UUID templateId) {
        DocumentTemplate template = findById(workspaceId, templateId);
        try {
            byte[] bytes = Files.readAllBytes(Path.of(template.getStoragePath()));
            return new TemplateFile(bytes, template.getOriginalFilename(), template.getContentType());
        } catch (IOException exception) {
            throw new IllegalStateException("The stored template file could not be read.", exception);
        }
    }

    @Transactional
    public void delete(UUID workspaceId, UUID templateId) {
        DocumentTemplate template = findById(workspaceId, templateId);
        repository.delete(template);
        deleteQuietly(template.getStoragePath(), null);
    }

    @Transactional(readOnly = true)
    public DocumentTemplate find(UUID workspaceId, String deliverableKey) {
        return repository.findByWorkspaceIdAndDeliverableKeyIgnoreCase(workspaceId, deliverableKey)
            .orElse(null);
    }

    private DocumentTemplateResponse saveBytes(
        UUID workspaceId,
        String deliverableKey,
        String displayName,
        String originalFilename,
        String contentType,
        byte[] bytes
    ) {
        String extractedText = textExtractor.extract(bytes, originalFilename, contentType);
        if (extractedText.length() < 50) {
            throw new IllegalArgumentException(
                "The template contains too little readable text for a useful comparison."
            );
        }

        DocumentTemplate existing = repository
            .findByWorkspaceIdAndDeliverableKeyIgnoreCase(workspaceId, deliverableKey.trim())
            .orElse(null);
        Path storedFile = store(workspaceId, bytes, originalFilename, contentType);
        String oldStoragePath = existing == null ? null : existing.getStoragePath();
        String sha256 = sha256(bytes);

        DocumentTemplate template;
        if (existing == null) {
            template = new DocumentTemplate(
                workspaceId,
                deliverableKey.trim(),
                displayName.trim(),
                originalFilename,
                contentType,
                storedFile.toString(),
                sha256,
                extractedText
            );
        } else {
            existing.replace(
                displayName.trim(),
                originalFilename,
                contentType,
                storedFile.toString(),
                sha256,
                extractedText
            );
            template = existing;
        }

        DocumentTemplate saved = repository.save(template);
        deleteQuietly(oldStoragePath, storedFile);
        return DocumentTemplateResponse.from(saved);
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

    private Path store(UUID workspaceId, byte[] bytes, String originalFilename, String contentType) {
        try {
            Path root = Path.of(properties.storagePath()).toAbsolutePath().normalize();
            Path workspaceDirectory = root.resolve(workspaceId.toString()).normalize();
            if (!workspaceDirectory.startsWith(root)) {
                throw new IllegalArgumentException("Template storage path is invalid.");
            }
            Files.createDirectories(workspaceDirectory);
            String extension = PDF_CONTENT_TYPE.equalsIgnoreCase(contentType)
                || originalFilename.toLowerCase(Locale.ROOT).endsWith(".pdf")
                ? ".pdf"
                : ".docx";
            Path temporary = Files.createTempFile(workspaceDirectory, "template-", ".tmp");
            Files.write(temporary, bytes);
            Path target = workspaceDirectory.resolve(UUID.randomUUID() + extension);
            return Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new IllegalStateException("The template could not be stored locally.", exception);
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
        String value = filename == null ? "template.docx" : Path.of(filename).getFileName().toString();
        return value.isBlank() ? "template.docx" : value;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private static void deleteQuietly(String storagePath, Path replacement) {
        if (storagePath == null || storagePath.isBlank()) {
            return;
        }
        Path oldPath = Path.of(storagePath).toAbsolutePath().normalize();
        if (replacement != null && oldPath.equals(replacement.toAbsolutePath().normalize())) {
            return;
        }
        try {
            Files.deleteIfExists(oldPath);
        } catch (IOException ignored) {
            // The database remains authoritative; stale local files can be cleaned manually.
        }
    }

    public record TemplateFile(byte[] bytes, String filename, String contentType) {
    }
}
