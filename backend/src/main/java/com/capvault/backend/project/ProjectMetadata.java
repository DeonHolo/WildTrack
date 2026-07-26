package com.capvault.backend.project;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "academic_project_metadata")
public class ProjectMetadata {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "group_code", nullable = false, length = 160)
    private String groupCode;

    @Column(name = "project_title", length = 1000)
    private String projectTitle;

    @Column(name = "software_name", length = 500)
    private String softwareName;

    @Column(name = "description")
    private String description;

    @Column(name = "proposal_remarks")
    private String proposalRemarks;

    @Column(name = "demo_comments")
    private String demoComments;

    @Column(name = "adviser_name", length = 240)
    private String adviserName;

    @Column(name = "project_status", length = 240)
    private String projectStatus;

    @Column(name = "category", length = 240)
    private String category;

    @Column(name = "source_row_number")
    private Integer sourceRowNumber;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected ProjectMetadata() {
    }

    public ProjectMetadata(
        UUID workspaceId,
        String groupCode,
        String projectTitle,
        String softwareName,
        String description,
        String proposalRemarks,
        String demoComments,
        String adviserName,
        String projectStatus,
        String category,
        Integer sourceRowNumber
    ) {
        this.workspaceId = workspaceId;
        updateFrom(
            groupCode,
            projectTitle,
            softwareName,
            description,
            proposalRemarks,
            demoComments,
            adviserName,
            projectStatus,
            category,
            sourceRowNumber
        );
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
        String groupCode,
        String projectTitle,
        String softwareName,
        String description,
        String proposalRemarks,
        String demoComments,
        String adviserName,
        String projectStatus,
        String category,
        Integer sourceRowNumber
    ) {
        this.groupCode = groupCode;
        this.projectTitle = normalizeNullable(projectTitle);
        this.softwareName = normalizeNullable(softwareName);
        this.description = normalizeNullable(description);
        this.proposalRemarks = normalizeNullable(proposalRemarks);
        this.demoComments = normalizeNullable(demoComments);
        this.adviserName = normalizeNullable(adviserName);
        this.projectStatus = normalizeNullable(projectStatus);
        this.category = normalizeNullable(category);
        this.sourceRowNumber = sourceRowNumber;
        this.updatedAt = LocalDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getWorkspaceId() {
        return workspaceId;
    }

    public String getGroupCode() {
        return groupCode;
    }

    public String getProjectTitle() {
        return projectTitle;
    }

    public String getSoftwareName() {
        return softwareName;
    }

    public String getDescription() {
        return description;
    }

    public String getProposalRemarks() {
        return proposalRemarks;
    }

    public String getDemoComments() {
        return demoComments;
    }

    public String getAdviserName() {
        return adviserName;
    }

    public String getProjectStatus() {
        return projectStatus;
    }

    public String getCategory() {
        return category;
    }

    public Integer getSourceRowNumber() {
        return sourceRowNumber;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
