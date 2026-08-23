package com.capvault.backend.auth;

public class GoogleIdentityUnavailableException extends RuntimeException {
    public GoogleIdentityUnavailableException(String message) {
        super(message);
    }
}
