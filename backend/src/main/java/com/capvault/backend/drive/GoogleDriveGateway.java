package com.capvault.backend.drive;

public interface GoogleDriveGateway {

    DriveFileMetadata getMetadata(DriveFileReference reference);

    byte[] download(DriveFileReference reference);

    boolean isConfigured();
}
