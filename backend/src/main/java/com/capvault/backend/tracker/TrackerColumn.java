package com.capvault.backend.tracker;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_tracker_columns")
public class TrackerColumn {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "column_key", nullable = false, length = 180)
    private String columnKey;

    @Column(name = "label", nullable = false, length = 180)
    private String label;

    @Column(name = "source_column", nullable = false, length = 180)
    private String sourceColumn;

    @Column(name = "source_column_index", nullable = false)
    private Integer sourceColumnIndex;

    @Column(name = "display_order", nullable = false)
    private Integer displayOrder;

    @Column(name = "active", nullable = false)
    private Boolean active;

    @Column(name = "pdf_required", nullable = false)
    private Boolean pdfRequired;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected TrackerColumn() {
    }

    public TrackerColumn(
        UUID workspaceId,
        String columnKey,
        String label,
        String sourceColumn,
        Integer sourceColumnIndex,
        Integer displayOrder,
        Boolean active,
        Boolean pdfRequired
    ) {
        this.workspaceId = workspaceId;
        updateFrom(columnKey, label, sourceColumn, sourceColumnIndex, displayOrder, active, pdfRequired);
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (updatedAt == null) {
            updatedAt = LocalDateTime.now();
        }
    }

    public void updateFrom(
        String columnKey,
        String label,
        String sourceColumn,
        Integer sourceColumnIndex,
        Integer displayOrder,
        Boolean active,
        Boolean pdfRequired
    ) {
        this.columnKey = columnKey;
        this.label = label;
        this.sourceColumn = sourceColumn;
        this.sourceColumnIndex = sourceColumnIndex;
        this.displayOrder = displayOrder;
        this.active = active;
        this.pdfRequired = pdfRequired;
        this.updatedAt = LocalDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getColumnKey() {
        return columnKey;
    }

    public String getLabel() {
        return label;
    }

    public String getSourceColumn() {
        return sourceColumn;
    }

    public Integer getSourceColumnIndex() {
        return sourceColumnIndex;
    }

    public Integer getDisplayOrder() {
        return displayOrder;
    }

    public Boolean getActive() {
        return active;
    }

    public Boolean getPdfRequired() {
        return pdfRequired;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
