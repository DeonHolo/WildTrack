package com.capvault.backend.deliverable;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_deliverables")
public class Deliverable {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "tracker_column_key", nullable = false, length = 160)
    private String trackerColumnKey;

    @Column(name = "title", nullable = false, length = 240)
    private String title;

    @Column(name = "slug", nullable = false, length = 180)
    private String slug;

    @Column(name = "instructions", length = 4000)
    private String instructions;

    @Column(name = "due_at", nullable = false)
    private LocalDateTime dueAt;

    @Column(name = "pdf_required", nullable = false)
    private boolean pdfRequired;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private DeliverableStatus status;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected Deliverable() {
    }

    public Deliverable(
        UUID workspaceId,
        String trackerColumnKey,
        String title,
        String slug,
        String instructions,
        LocalDateTime dueAt,
        boolean pdfRequired,
        DeliverableStatus status
    ) {
        this.workspaceId = workspaceId;
        this.trackerColumnKey = trackerColumnKey;
        this.title = title;
        this.slug = slug;
        this.instructions = instructions;
        this.dueAt = dueAt;
        this.pdfRequired = pdfRequired;
        this.status = status;
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

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getTrackerColumnKey() {
        return trackerColumnKey;
    }

    public void setTrackerColumnKey(String trackerColumnKey) {
        this.trackerColumnKey = trackerColumnKey;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public String getInstructions() {
        return instructions;
    }

    public void setInstructions(String instructions) {
        this.instructions = instructions;
    }

    public LocalDateTime getDueAt() {
        return dueAt;
    }

    public void setDueAt(LocalDateTime dueAt) {
        this.dueAt = dueAt;
    }

    public boolean isPdfRequired() {
        return pdfRequired;
    }

    public void setPdfRequired(boolean pdfRequired) {
        this.pdfRequired = pdfRequired;
    }

    public DeliverableStatus getStatus() {
        return status;
    }

    public void setStatus(DeliverableStatus status) {
        this.status = status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
