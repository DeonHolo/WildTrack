package com.capvault.backend.drive;

public class GoogleDriveUnavailableException extends RuntimeException {

    public GoogleDriveUnavailableException(String message) {
        super(message);
    }

    public GoogleDriveUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
