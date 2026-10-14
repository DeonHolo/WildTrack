package com.capvault.backend.drive;

import com.capvault.backend.filecheck.DriveFailureDetails;

public class GoogleDriveUnavailableException extends RuntimeException {

    public enum Kind { FILE_ACCESS, CONFIGURATION, RATE_LIMIT, PROVIDER_UNAVAILABLE, UNKNOWN }

    private final Kind kind;
    private final DriveFailureDetails failureDetails;

    public GoogleDriveUnavailableException(String message) {
        this(message, null, Kind.UNKNOWN, null);
    }
    public GoogleDriveUnavailableException(String message, Throwable cause) {
        this(message, cause, Kind.UNKNOWN, null);
    }
    public GoogleDriveUnavailableException(String message, Kind kind) {
        this(message, null, kind, null);
    }
    public GoogleDriveUnavailableException(String message, Throwable cause, Kind kind) {
        this(message, cause, kind, null);
    }
    public GoogleDriveUnavailableException(String message, Kind kind, DriveFailureDetails details) {
        this(message, null, kind, details);
    }
    public GoogleDriveUnavailableException(String message, Throwable cause, Kind kind, DriveFailureDetails details) {
        super(message, cause);
        this.kind = kind == null ? Kind.UNKNOWN : kind;
        this.failureDetails = details;
    }
    public Kind kind() { return kind; }
    public DriveFailureDetails failureDetails() { return failureDetails; }
}
