package com.capvault.backend.filecheck;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;

public record ObservedFileHistoryView(
    String sourceLabel,
    String coverageMessage,
    String olderRevisionHistoryMessage,
    List<Observation> observations
) {
    public record Observation(
        String changeType,
        String sourceLabel,
        LocalDateTime firstObservedAt,
        LocalDateTime lastObservedAt,
        OffsetDateTime driveModifiedTime,
        String contentIdentifier,
        String checksumAlgorithm,
        String modifiedBy,
        String modifiedByEmail,
        String providerDisplayName,
        String editorMetadataSource,
        boolean editorMetadataAvailable,
        String fileId,
        String fileName,
        String sourceUrl,
        OffsetDateTime driveCreatedTime,
        String driveOwner,
        com.capvault.backend.student.RegisteredDriveStudentResolver.Student driveOwnerStudent,
        com.capvault.backend.student.RegisteredDriveStudentResolver.Student modifiedByStudent
    ) {
    }
}
