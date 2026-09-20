package com.capvault.backend.drivehistory;

import java.util.List;

/**
 * A source-labeled view of Google revision metadata, never the WildTrack
 * Document Check observation history. Caller role determines identity redaction.
 */
public record SharedDriveHistoryView(
    String sourceLabel,
    String coverageMessage,
    String status,
    String sourceFileId,
    List<Revision> revisions,
    String nextPageToken,
    boolean historyMayBeIncomplete,
    FileMetadata fileMetadata
) {
    /**
     * Authorized current-file metadata. These values do not rewrite older
     * Document Check reports and cannot prove the identity of the author.
     * Owner/editor names are null in student responses.
     */
    public record FileMetadata(
        String createdTime,
        String driveOwner,
        String lastModifiedTime,
        String lastModifiedBy
    ) { }

    public record Revision(
        String id,
        String modifiedTime,
        String mimeType,
        String size,
        Boolean keepForever,
        String modifiedBy,
        String modifiedByEmail
    ) { }

    static SharedDriveHistoryView unavailable(String status, String message, String fileId) {
        return new SharedDriveHistoryView("Google Drive revision metadata", message, status,
            fileId, List.of(), null, true, null);
    }
}
