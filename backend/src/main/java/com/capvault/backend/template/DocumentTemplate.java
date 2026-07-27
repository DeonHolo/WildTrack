package com.capvault.backend.template;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_document_templates")
public class DocumentTemplate {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "deliverable_key", nullable = false, length = 180)
    private String deliverableKey;

    @Column(name = "display_name", nullable = false, length = 240)
    private String displayName;

    @Column(name = "original_filename", nullable = false, length = 500)
    private String originalFilename;

    @Column(name = "content_type", nullable = false, length = 160)
    private String contentType;

    @Column(name = "storage_path", nullable = false, length = 1600)
    private String storagePath;

    @Column(nullable = false, length = 64)
    private String sha256;

    @Column(name = "extracted_text", nullable = false, columnDefinition = "TEXT")
    private String extractedText;

    @Column(name = "extracted_character_count", nullable = false)
    private int extractedCharacterCount;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected DocumentTemplate() {
    }

    public DocumentTemplate(
        UUID workspaceId,
        String deliverableKey,
        String displayName,
        String originalFilename,
        String contentType,
        String storagePath,
        String sha256,
        String extractedText
    ) {
        this.workspaceId = workspaceId;
        this.deliverableKey = deliverableKey;
        this.displayName = displayName;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.storagePath = storagePath;
        this.sha256 = sha256;
        this.extractedText = extractedText;
        this.extractedCharacterCount = extractedText.length();
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void replace(
        String displayName,
        String originalFilename,
        String contentType,
        String storagePath,
        String sha256,
        String extractedText
    ) {
        this.displayName = displayName;
        this.originalFilename = originalFilename;
        this.contentType = contentType;
        this.storagePath = storagePath;
        this.sha256 = sha256;
        this.extractedText = extractedText;
        this.extractedCharacterCount = extractedText.length();
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getDeliverableKey() {
        return deliverableKey;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getContentType() {
        return contentType;
    }

    public String getStoragePath() {
        return storagePath;
    }

    public String getSha256() {
        return sha256;
    }

    public String getExtractedText() {
        return extractedText;
    }

    public int getExtractedCharacterCount() {
        return extractedCharacterCount;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
