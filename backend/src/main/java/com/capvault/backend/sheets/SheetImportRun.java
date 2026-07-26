package com.capvault.backend.sheets;

import java.time.LocalDateTime;
import java.util.UUID;

import com.capvault.backend.workspace.WorkspaceSource;
import com.capvault.backend.workspace.WorkspaceSourceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_sheet_import_runs")
public class SheetImportRun {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 40)
    private WorkspaceSourceType sourceType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_id")
    private WorkspaceSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private SheetImportStatus status;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "rows_found", nullable = false)
    private Integer rowsFound;

    @Column(name = "columns_found", nullable = false)
    private Integer columnsFound;

    @Column(name = "warnings")
    private String warnings;

    @Column(name = "summary_json")
    private String summaryJson;

    protected SheetImportRun() {
    }

    public SheetImportRun(UUID workspaceId, WorkspaceSourceType sourceType, WorkspaceSource source) {
        this.workspaceId = workspaceId;
        this.sourceType = sourceType;
        this.source = source;
        this.status = SheetImportStatus.ERROR;
        this.startedAt = LocalDateTime.now();
        this.rowsFound = 0;
        this.columnsFound = 0;
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
    }

    public void complete(
        SheetImportStatus status,
        Integer rowsFound,
        Integer columnsFound,
        String warnings,
        String summaryJson
    ) {
        this.status = status;
        this.rowsFound = rowsFound;
        this.columnsFound = columnsFound;
        this.warnings = warnings;
        this.summaryJson = summaryJson;
        this.completedAt = LocalDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public WorkspaceSourceType getSourceType() {
        return sourceType;
    }

    public SheetImportStatus getStatus() {
        return status;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public LocalDateTime getCompletedAt() {
        return completedAt;
    }

    public Integer getRowsFound() {
        return rowsFound;
    }

    public Integer getColumnsFound() {
        return columnsFound;
    }

    public String getWarnings() {
        return warnings;
    }

    public String getSummaryJson() {
        return summaryJson;
    }
}
