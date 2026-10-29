package com.capvault.backend.archive;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

public record ArchiveRecordResponse(
    UUID id,
    UUID attemptId,
    Instant sourceResponseUpdatedAt,
    Instant activeAcceptanceAt,
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
    boolean verified,
    String captureState,
    String lifecycleState,
    long stateVersion,
    String error,
    List<StoredFile> files,
    List<History> history
) {
    public record ArchivedArtifact(String fieldKey, String label, String fieldType, String value) {
    }
    public record StoredFile(UUID id, String label, String filename, String sourceFileId,
        String sourceRevision, String sha256, long size, Instant capturedAt, String status,
        String error, String downloadUrl, String provider) { }
    public record History(String action, Instant occurredAt, String actor) { }

    public static ArchiveRecordResponse from(ArchiveRecord record, ObjectMapper objectMapper) {
        return from(record, objectMapper, List.of(), List.of());
    }

    public static ArchiveRecordResponse from(ArchiveRecord record, ObjectMapper objectMapper,
        List<ArchiveFileStore.File> files, List<History> history) {
        List<ArchivedArtifact> artifacts = parseArtifacts(record, objectMapper);
        boolean complete = "COMPLETE".equals(record.getCaptureState()) && !files.isEmpty()
            && files.stream().allMatch(ArchiveFileStore.File::stored);
        String storage = complete ? "Stored" : switch (record.getCaptureState()) {
            case "QUEUED", "COPYING" -> "Copying";
            case "FAILED" -> "Storage failed";
            default -> "Metadata only";
        };
        var retained = files.stream().map(file -> new StoredFile(file.id(), file.label(), file.filename(),
            file.sourceFileId(), "md5:" + file.md5() + " | modified:" + file.modifiedTime(),
            file.sha256(), file.size(), file.capturedAt(), file.status(), file.error(),
            file.stored() ? "/api/archive/" + record.getId() + "/files/" + file.id()
                + "?workspaceId=" + record.getWorkspaceId() : null, file.providerId())).toList();
        return new ArchiveRecordResponse(
            record.getId(), record.getResponseId(), record.getSourceResponseUpdatedAt(), record.getActiveAcceptanceAt(), record.getWorkspaceId(), record.getWorkspaceName(),
            record.getDeliverableTitle(), record.getTeamCode(), record.getStudentName(), record.getStudentNumber(),
            record.getProjectTitle(), record.getSoftwareName(), record.getAdviserName(), "v" + record.getVersionNumber(),
            record.getArchivedAt(), record.getSourceLink(), artifacts, record.getMetadataSha256(),
            files.size() == 1 ? files.get(0).sha256() : null,
            storage, complete ? "Verified" : "Unavailable", complete,
            record.getCaptureState(), record.isActive() ? "Archived" : "Active", record.getStateVersion(),
            record.getCaptureError(), retained, history
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
