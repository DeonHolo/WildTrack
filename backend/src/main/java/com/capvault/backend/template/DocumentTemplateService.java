package com.capvault.backend.template;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class DocumentTemplateService {

    private final DocumentTemplateRepository repository;
    private final DocumentTextExtractor textExtractor;
    private final TemplateStorageProperties properties;

    public DocumentTemplateService(
        DocumentTemplateRepository repository,
        DocumentTextExtractor textExtractor,
        TemplateStorageProperties properties
    ) {
        this.repository = repository;
        this.textExtractor = textExtractor;
        this.properties = properties;
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
        validate(workspaceId, deliverableKey, displayName, file);
        byte[] bytes = readBytes(file);
        String originalFilename = safeFilename(file.getOriginalFilename());
        String contentType = file.getContentType() == null
            ? "application/octet-stream"
            : file.getContentType();
        String extractedText = textExtractor.extract(bytes, originalFilename, contentType);
        if (extractedText.length() < 50) {
            throw new IllegalArgumentException(
                "The template contains too little readable text for a useful comparison."
            );
        }

        DocumentTemplate existing = repository
            .findByWorkspaceIdAndDeliverableKeyIgnoreCase(workspaceId, deliverableKey.trim())
            .orElse(null);
        Path storedFile = store(workspaceId, bytes, originalFilename);
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

    @Transactional
    public void delete(UUID workspaceId, UUID templateId) {
        DocumentTemplate template = repository.findById(templateId)
            .filter(item -> item.getWorkspaceId().equals(workspaceId))
            .orElseThrow(() -> new IllegalArgumentException("Template was not found."));
        repository.delete(template);
        deleteQuietly(template.getStoragePath(), null);
    }

    @Transactional(readOnly = true)
    public DocumentTemplate find(UUID workspaceId, String deliverableKey) {
        return repository.findByWorkspaceIdAndDeliverableKeyIgnoreCase(workspaceId, deliverableKey)
            .orElse(null);
    }

    private void validate(
        UUID workspaceId,
        String deliverableKey,
        String displayName,
        MultipartFile file
    ) {
        if (workspaceId == null) {
            throw new IllegalArgumentException("Workspace is required.");
        }
        if (deliverableKey == null || deliverableKey.isBlank()) {
            throw new IllegalArgumentException("Deliverable is required.");
        }
        if (displayName == null || displayName.isBlank()) {
            throw new IllegalArgumentException("Template name is required.");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Choose a DOCX or PDF template file.");
        }
        if (file.getSize() > properties.maximumFileSizeBytes()) {
            throw new IllegalArgumentException("The template exceeds the 15 MB upload limit.");
        }
    }

    private byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new IllegalArgumentException("The template upload could not be read.");
        }
    }

    private Path store(UUID workspaceId, byte[] bytes, String originalFilename) {
        try {
            Path root = Path.of(properties.storagePath()).toAbsolutePath().normalize();
            Path workspaceDirectory = root.resolve(workspaceId.toString()).normalize();
            if (!workspaceDirectory.startsWith(root)) {
                throw new IllegalArgumentException("Template storage path is invalid.");
            }
            Files.createDirectories(workspaceDirectory);
            String extension = originalFilename.toLowerCase().endsWith(".pdf") ? ".pdf" : ".docx";
            Path temporary = Files.createTempFile(workspaceDirectory, "upload-", ".tmp");
            Files.write(temporary, bytes);
            Path target = workspaceDirectory.resolve(UUID.randomUUID() + extension);
            return Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException exception) {
            throw new IllegalStateException("The template could not be stored locally.", exception);
        }
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
}
