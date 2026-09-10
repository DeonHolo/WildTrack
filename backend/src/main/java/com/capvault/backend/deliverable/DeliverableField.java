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
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "academic_deliverable_fields", uniqueConstraints = @UniqueConstraint(
    name = "uq_deliverable_field_key", columnNames = {"deliverable_id", "field_key"}))
public class DeliverableField {

    @Id
    @Column(length = 80)
    private String id;

    @Column(name = "deliverable_id", nullable = false)
    private UUID deliverableId;

    @Column(name = "field_key", nullable = false, length = 160)
    private String fieldKey;

    @Column(nullable = false, length = 240)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "field_type", nullable = false, length = 40)
    private DeliverableFieldType fieldType;

    @Column(nullable = false)
    private boolean required;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_check_policy", nullable = false, length = 20)
    private DocumentCheckPolicy documentCheckPolicy;

    @Column(name = "ai_review_enabled", nullable = false)
    private boolean aiReviewEnabled;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected DeliverableField() {
    }

    public DeliverableField(String id, UUID deliverableId, String fieldKey, String label,
            DeliverableFieldType fieldType, boolean required, int displayOrder,
            DocumentCheckPolicy documentCheckPolicy, boolean aiReviewEnabled, boolean active) {
        this.id = id;
        this.deliverableId = deliverableId;
        this.fieldKey = fieldKey;
        this.label = label;
        this.fieldType = fieldType;
        this.required = required;
        this.displayOrder = displayOrder;
        this.documentCheckPolicy = documentCheckPolicy;
        this.aiReviewEnabled = aiReviewEnabled;
        this.active = active;
    }

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (id == null || id.isBlank()) id = UUID.randomUUID().toString();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public void update(String label, DeliverableFieldType fieldType, boolean required, int displayOrder,
            DocumentCheckPolicy documentCheckPolicy, boolean aiReviewEnabled, boolean active) {
        this.label = label;
        this.fieldType = fieldType;
        this.required = required;
        this.displayOrder = displayOrder;
        this.documentCheckPolicy = documentCheckPolicy;
        this.aiReviewEnabled = aiReviewEnabled;
        this.active = active;
    }

    public String getId() { return id; }
    public UUID getDeliverableId() { return deliverableId; }
    public String getFieldKey() { return fieldKey; }
    public String getLabel() { return label; }
    public DeliverableFieldType getFieldType() { return fieldType; }
    public boolean isRequired() { return required; }
    public int getDisplayOrder() { return displayOrder; }
    public DocumentCheckPolicy getDocumentCheckPolicy() { return documentCheckPolicy; }
    public boolean isAiReviewEnabled() { return aiReviewEnabled; }
    public boolean isActive() { return active; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
