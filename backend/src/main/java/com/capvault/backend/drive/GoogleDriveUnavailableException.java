package com.capvault.backend.drive;

public class GoogleDriveUnavailableException extends RuntimeException {

    public enum Kind {
        FILE_ACCESS,
        CONFIGURATION,
        RATE_LIMIT,
        PROVIDER_UNAVAILABLE,
        UNKNOWN
    }

    private final Kind kind;

    public GoogleDriveUnavailableException(String message) {
        super(message);
        this.kind = Kind.UNKNOWN;
    }

    public GoogleDriveUnavailableException(String message, Throwable cause) {
        super(message, cause);
        this.kind = Kind.UNKNOWN;
    }

    public GoogleDriveUnavailableException(String message, Kind kind) {
        super(message);
        this.kind = kind == null ? Kind.UNKNOWN : kind;
    }

    public GoogleDriveUnavailableException(String message, Throwable cause, Kind kind) {
        super(message, cause);
        this.kind = kind == null ? Kind.UNKNOWN : kind;
    }

    public Kind kind() {
        return kind;
    }
}
