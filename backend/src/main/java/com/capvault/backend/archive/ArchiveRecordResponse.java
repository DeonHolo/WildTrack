package com.capvault.backend.archive;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    List<ArchivedArtifact> artifacts,
    String metadataSha256,
    String sha256,
    String storageStatus,
    String integrityStatus,
    boolean verified
) {
    public record ArchivedArtifact(String fieldKey, String label, String fieldType, String value) {
    }

    public static ArchiveRecordResponse from(ArchiveRecord record, ObjectMapper objectMapper) {
        List<ArchivedArtifact> artifacts = parseArtifacts(record, objectMapper);
        return new ArchiveRecordResponse(
            record.getId(), record.getResponseId(), record.getWorkspaceId(), record.getWorkspaceName(),
            record.getDeliverableTitle(), record.getTeamCode(), record.getStudentName(), record.getStudentNumber(),
            record.getProjectTitle(), record.getSoftwareName(), record.getAdviserName(), "v" + record.getVersionNumber(),
            record.getArchivedAt(), record.getSourceLink(), artifacts, record.getMetadataSha256(), record.getMetadataSha256(),
            "Metadata only", "Unavailable", false
        );
    }

    private static List<ArchivedArtifact> parseArtifacts(ArchiveRecord record, ObjectMapper objectMapper) {
        String snapshot = record.getArtifactSnapshotJson();
        if (snapshot != null && !snapshot.isBlank()) {
            try {
                return objectMapper.readValue(snapshot, new TypeReference<List<ArchivedArtifact>>() { });
            } catch (Exception ignored) {
                // Preserve access to older or malformed archive rows through sourceLink fallback.
            }
        }
        if (record.getSourceLink() != null && !record.getSourceLink().isBlank()) {
            return List.of(new ArchivedArtifact("sourceLink", "Submitted source", "GENERAL_URL", record.getSourceLink()));
        }
        return List.of();
    }
}
