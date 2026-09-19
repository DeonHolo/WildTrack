package com.capvault.backend.drive;

import java.time.OffsetDateTime;

public record DriveFileMetadata(
    String id,
    String name,
    String mimeType,
    Long size,
    String md5Checksum,
    OffsetDateTime modifiedTime,
    String lastModifyingUserEmail,
    String lastModifyingUserDisplayName,
    boolean canDownload,
    String webViewLink
) {
    public DriveFileMetadata(
        String id,
        String name,
        String mimeType,
        Long size,
        String md5Checksum,
        OffsetDateTime modifiedTime,
        boolean canDownload,
        String webViewLink
    ) {
        this(id, name, mimeType, size, md5Checksum, modifiedTime, null, null, canDownload, webViewLink);
    }
}
