package com.capvault.backend.tracker;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_tracker_cells")
public class TrackerCell {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tracker_row_id", nullable = false)
    private TrackerRow trackerRow;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tracker_column_id", nullable = false)
    private TrackerColumn trackerColumn;

    @Column(name = "raw_value", length = 1000)
    private String rawValue;

    @Column(name = "normalized_status", nullable = false, length = 80)
    private String normalizedStatus;

    @Column(name = "source_row_number", nullable = false)
    private Integer sourceRowNumber;

    @Column(name = "source_column_index", nullable = false)
    private Integer sourceColumnIndex;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected TrackerCell() {
    }

    public TrackerCell(
        TrackerRow trackerRow,
        TrackerColumn trackerColumn,
        String rawValue,
        String normalizedStatus,
        Integer sourceRowNumber,
        Integer sourceColumnIndex
    ) {
        this.trackerRow = trackerRow;
        this.trackerColumn = trackerColumn;
        updateValue(rawValue, normalizedStatus, sourceRowNumber, sourceColumnIndex);
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

    public void updateValue(String rawValue, String normalizedStatus, Integer sourceRowNumber, Integer sourceColumnIndex) {
        this.rawValue = rawValue == null ? "" : rawValue;
        this.normalizedStatus = normalizedStatus;
        this.sourceRowNumber = sourceRowNumber;
        this.sourceColumnIndex = sourceColumnIndex;
        this.updatedAt = LocalDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public TrackerRow getTrackerRow() {
        return trackerRow;
    }

    public TrackerColumn getTrackerColumn() {
        return trackerColumn;
    }

    public String getRawValue() {
        return rawValue;
    }

    public String getNormalizedStatus() {
        return normalizedStatus;
    }

    public Integer getSourceRowNumber() {
        return sourceRowNumber;
    }

    public Integer getSourceColumnIndex() {
        return sourceColumnIndex;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
