package com.capvault.backend.filecheck;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_file_check_reports")
public class FileCheckReport {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "external_response_id", nullable = false, length = 240)
    private String externalResponseId;

    @Column(name = "deliverable_key", nullable = false, length = 180)
    private String deliverableKey;

    @Column(name = "source_url", nullable = false, length = 2048)
    private String sourceUrl;

    @Column(name = "source_response_updated_at", length = 80)
    private String sourceResponseUpdatedAt;

    @Column(nullable = false, length = 60)
    private String status;

    @Column(name = "attention_required", nullable = false)
    private boolean attentionRequired;

    @Column(name = "primary_flag", length = 120)
    private String primaryFlag;

    @Column(name = "report_json", nullable = false, columnDefinition = "TEXT")
    private String reportJson;

    @Column(name = "checked_at", nullable = false)
    private LocalDateTime checkedAt;

    protected FileCheckReport() {
    }

    public FileCheckReport(
        UUID workspaceId,
        FileCheckRequest request,
        FileCheckResponse response,
        String reportJson
    ) {
        this.workspaceId = workspaceId;
        this.externalResponseId = request.responseId();
        this.deliverableKey = request.deliverableKey();
        this.sourceUrl = request.sourceUrl();
        this.sourceResponseUpdatedAt = request.sourceResponseUpdatedAt();
        this.status = response.status();
        this.attentionRequired = response.attentionRequired();
        this.primaryFlag = response.flags().isEmpty() ? null : response.flags().get(0);
        this.reportJson = reportJson;
        this.checkedAt = response.checkedAt();
    }

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (checkedAt == null) {
            checkedAt = LocalDateTime.now();
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getExternalResponseId() {
        return externalResponseId;
    }

    public String getReportJson() {
        return reportJson;
    }

    public LocalDateTime getCheckedAt() {
        return checkedAt;
    }
}
