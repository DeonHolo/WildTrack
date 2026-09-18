package com.capvault.backend.deliverable;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_deliverable_field_options")
public class DeliverableFieldOption {

    @Id
    @Column(length = 80)
    private String id;

    @Column(name = "field_id", nullable = false, length = 80)
    private String fieldId;

    @Column(nullable = false, length = 240)
    private String label;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected DeliverableFieldOption() {
    }

    public DeliverableFieldOption(String id, String fieldId, String label, int displayOrder) {
        this.id = id;
        this.fieldId = fieldId;
        this.label = label;
        this.displayOrder = displayOrder;
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

    public void update(String label, int displayOrder) {
        this.label = label;
        this.displayOrder = displayOrder;
    }

    public String getId() { return id; }
    public String getFieldId() { return fieldId; }
    public String getLabel() { return label; }
    public int getDisplayOrder() { return displayOrder; }
}
