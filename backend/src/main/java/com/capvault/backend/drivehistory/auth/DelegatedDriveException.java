package com.capvault.backend.drivehistory.auth;

public final class DelegatedDriveException extends RuntimeException {
    public enum Reason { PERMISSION_DENIED, AUTH_REVOKED, PROVIDER_UNAVAILABLE }

    private final Reason reason;

    public DelegatedDriveException(Reason reason) {
        super(switch (reason) {
            case PERMISSION_DENIED -> "This Google account cannot read revision metadata for the submitted file.";
            case AUTH_REVOKED -> "Drive history access expired or was revoked.";
            case PROVIDER_UNAVAILABLE -> "Google Drive revision metadata is temporarily unavailable.";
        });
        this.reason = reason;
    }

    public Reason reason() { return reason; }
}
