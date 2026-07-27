package com.capvault.backend.drive;

import java.time.OffsetDateTime;

public record DriveFileMetadata(
    String id,
    String name,
    String mimeType,
    Long size,
    String md5Checksum,
    OffsetDateTime modifiedTime,
    boolean canDownload,
    String webViewLink
) {
}
