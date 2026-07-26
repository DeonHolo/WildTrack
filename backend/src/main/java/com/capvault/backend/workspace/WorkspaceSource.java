package com.capvault.backend.workspace;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_workspace_sources")
public class WorkspaceSource {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", nullable = false, length = 40)
    private WorkspaceSourceType sourceType;

    @Column(name = "sheet_url", nullable = false, length = 2048)
    private String sheetUrl;

    @Column(name = "sheet_id", nullable = false, length = 200)
    private String sheetId;

    @Column(name = "display_name", length = 200)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 40)
    private WorkspaceSourceStatus status;

    @Column(name = "connected_at", nullable = false)
    private LocalDateTime connectedAt;

    @Column(name = "last_imported_at")
    private LocalDateTime lastImportedAt;

    protected WorkspaceSource() {
    }

    public WorkspaceSource(
        UUID workspaceId,
        WorkspaceSourceType sourceType,
        String sheetUrl,
        String sheetId,
        String displayName,
        WorkspaceSourceStatus status,
        LocalDateTime connectedAt
    ) {
        this.workspaceId = workspaceId;
        this.sourceType = sourceType;
        this.sheetUrl = sheetUrl;
        this.sheetId = sheetId;
        this.displayName = displayName;
        this.status = status;
        this.connectedAt = connectedAt;
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
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

    public void setSourceType(WorkspaceSourceType sourceType) {
        this.sourceType = sourceType;
    }

    public String getSheetUrl() {
        return sheetUrl;
    }

    public void setSheetUrl(String sheetUrl) {
        this.sheetUrl = sheetUrl;
    }

    public String getSheetId() {
        return sheetId;
    }

    public void setSheetId(String sheetId) {
        this.sheetId = sheetId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public WorkspaceSourceStatus getStatus() {
        return status;
    }

    public void setStatus(WorkspaceSourceStatus status) {
        this.status = status;
    }

    public LocalDateTime getConnectedAt() {
        return connectedAt;
    }

    public void setConnectedAt(LocalDateTime connectedAt) {
        this.connectedAt = connectedAt;
    }

    public LocalDateTime getLastImportedAt() {
        return lastImportedAt;
    }

    public void setLastImportedAt(LocalDateTime lastImportedAt) {
        this.lastImportedAt = lastImportedAt;
    }
}
