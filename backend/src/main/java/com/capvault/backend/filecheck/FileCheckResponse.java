package com.capvault.backend.filecheck;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record FileCheckResponse(
    UUID id,
    String responseId,
    String sourceResponseUpdatedAt,
    String status,
    boolean attentionRequired,
    String summary,
    List<String> flags,
    List<String> redFlags,
    List<String> missingSections,
    String suggestedAction,
    DriveMetadata metadata,
    DocumentResult document,
    TemplateComparison templateComparison,
    String checkedBy,
    LocalDateTime checkedAt
) {
    public FileCheckResponse withId(UUID reportId) {
        return new FileCheckResponse(
            reportId,
            responseId,
            sourceResponseUpdatedAt,
            status,
            attentionRequired,
            summary,
            flags,
            redFlags,
            missingSections,
            suggestedAction,
            metadata,
            document,
            templateComparison,
            checkedBy,
            checkedAt
        );
    }

    public record DriveMetadata(
        String fileId,
        String name,
        String mimeType,
        Long size,
        String md5Checksum,
        OffsetDateTime modifiedTime,
        boolean canDownload,
        String webViewLink
    ) {
    }

    public record DocumentResult(
        boolean readable,
        boolean encrypted,
        int pageCount,
        int extractedCharacterCount
    ) {
    }
}
