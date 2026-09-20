package com.capvault.backend.drivehistory.auth;

import java.util.List;

public interface DelegatedDriveGateway {
    Page revisions(String bearerAccessToken, String fileId, String pageToken, int pageSize);

    FileDetails fileMetadata(String bearerAccessToken, String fileId);

    record Page(List<DriveRevisionMetadata> revisions, String nextPageToken) { }
    record FileDetails(String createdTime, String driveOwner, String lastModifiedTime, String lastModifiedBy) { }
}
