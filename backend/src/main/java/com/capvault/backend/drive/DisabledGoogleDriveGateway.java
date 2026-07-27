package com.capvault.backend.drive;

final class DisabledGoogleDriveGateway implements GoogleDriveGateway {

    @Override
    public DriveFileMetadata getMetadata(DriveFileReference reference) {
        throw new GoogleDriveUnavailableException(
            "Google Drive API is not configured. Run setup-local.ps1 and restart the backend."
        );
    }

    @Override
    public byte[] download(DriveFileReference reference) {
        throw new GoogleDriveUnavailableException(
            "Google Drive API is not configured. Run setup-local.ps1 and restart the backend."
        );
    }

    @Override
    public boolean isConfigured() {
        return false;
    }
}
