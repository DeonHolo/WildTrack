package com.capvault.backend.archive;

import java.time.Instant;
import java.util.UUID;

public record ArchiveRecordResponse(
    UUID id,
    UUID attemptId,
    UUID workspaceId,
    String workspaceName,
    String deliverableTitle,
    String teamCode,
    String studentName,
    String studentNumber,
    String projectTitle,
    String softwareName,
    String adviserName,
    String version,
    Instant archivedAt,
    String sourceLink,
    String metadataSha256,
    String sha256,
    String storageStatus,
    String integrityStatus,
    boolean verified
) {
    public static ArchiveRecordResponse from(ArchiveRecord record) {
        return new ArchiveRecordResponse(
            record.getId(), record.getResponseId(), record.getWorkspaceId(), record.getWorkspaceName(),
            record.getDeliverableTitle(), record.getTeamCode(), record.getStudentName(), record.getStudentNumber(),
            record.getProjectTitle(), record.getSoftwareName(), record.getAdviserName(), "v" + record.getVersionNumber(),
            record.getArchivedAt(), record.getSourceLink(), record.getMetadataSha256(), record.getMetadataSha256(),
            "Metadata only", "Unavailable", false
        );
    }
}
