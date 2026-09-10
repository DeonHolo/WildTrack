package com.capvault.backend.archive;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "archive_records", uniqueConstraints = @UniqueConstraint(
    name = "uq_archive_response_version", columnNames = {"response_id", "source_response_updated_at"}))
public class ArchiveRecord {

    @Id
    private UUID id;
    @Column(name = "workspace_id", nullable = false) private UUID workspaceId;
    @Column(name = "response_id", nullable = false) private UUID responseId;
    @Column(name = "source_response_updated_at", nullable = false) private Instant sourceResponseUpdatedAt;
    @Column(name = "workspace_name", nullable = false) private String workspaceName;
    @Column(name = "deliverable_title", nullable = false) private String deliverableTitle;
    @Column(name = "team_code", nullable = false) private String teamCode;
    @Column(name = "student_name", nullable = false) private String studentName;
    @Column(name = "student_number", nullable = false) private String studentNumber;
    @Column(name = "project_title") private String projectTitle;
    @Column(name = "software_name") private String softwareName;
    @Column(name = "adviser_name") private String adviserName;
    @Column(name = "version_number", nullable = false) private int versionNumber;
    @Column(name = "source_link", columnDefinition = "TEXT") private String sourceLink;
    @Column(name = "artifact_snapshot_json", columnDefinition = "TEXT") private String artifactSnapshotJson;
    @Column(name = "metadata_sha256", nullable = false, length = 64) private String metadataSha256;
    @Column(name = "archived_at", nullable = false) private Instant archivedAt;

    protected ArchiveRecord() {
    }

    public ArchiveRecord(
        UUID id, UUID workspaceId, UUID responseId, Instant sourceResponseUpdatedAt,
        String workspaceName, String deliverableTitle, String teamCode, String studentName,
        String studentNumber, String projectTitle, String softwareName, String adviserName,
        int versionNumber, String sourceLink, String artifactSnapshotJson, String metadataSha256, Instant archivedAt
    ) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.responseId = responseId;
        this.sourceResponseUpdatedAt = sourceResponseUpdatedAt;
        this.workspaceName = workspaceName;
        this.deliverableTitle = deliverableTitle;
        this.teamCode = teamCode;
        this.studentName = studentName;
        this.studentNumber = studentNumber;
        this.projectTitle = projectTitle;
        this.softwareName = softwareName;
        this.adviserName = adviserName;
        this.versionNumber = versionNumber;
        this.sourceLink = sourceLink;
        this.artifactSnapshotJson = artifactSnapshotJson;
        this.metadataSha256 = metadataSha256;
        this.archivedAt = archivedAt;
    }

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; }
    public UUID getResponseId() { return responseId; }
    public Instant getSourceResponseUpdatedAt() { return sourceResponseUpdatedAt; }
    public String getWorkspaceName() { return workspaceName; }
    public String getDeliverableTitle() { return deliverableTitle; }
    public String getTeamCode() { return teamCode; }
    public String getStudentName() { return studentName; }
    public String getStudentNumber() { return studentNumber; }
    public String getProjectTitle() { return projectTitle; }
    public String getSoftwareName() { return softwareName; }
    public String getAdviserName() { return adviserName; }
    public int getVersionNumber() { return versionNumber; }
    public String getSourceLink() { return sourceLink; }
    public String getArtifactSnapshotJson() { return artifactSnapshotJson; }
    public String getMetadataSha256() { return metadataSha256; }
    public Instant getArchivedAt() { return archivedAt; }
}
