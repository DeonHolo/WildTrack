package com.capvault.backend.auth;

public class InvalidGoogleCredentialException extends RuntimeException {
    public InvalidGoogleCredentialException(String message) {
        super(message);
    }

    public InvalidGoogleCredentialException(String message, Throwable cause) {
        super(message, cause);
    }
}
