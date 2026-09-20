package com.capvault.backend.drivehistory.auth;

/** Metadata returned by Google's revisions.list; absent fields are null. */
public record DriveRevisionMetadata(
    String id,
    String modifiedTime,
    String mimeType,
    String size,
    Boolean keepForever,
    String modifiedBy,
    String modifiedByEmail
) { }
