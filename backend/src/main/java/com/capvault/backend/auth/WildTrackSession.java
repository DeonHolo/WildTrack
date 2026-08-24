package com.capvault.backend.auth;

public record WildTrackSession(
    String rawToken,
    String tokenHash
) {
}
