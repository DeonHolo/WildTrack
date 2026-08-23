package com.capvault.backend.auth;

import java.time.Instant;

public record StoredWildTrackSession(
    String tokenHash,
    String googleSubject,
    String googleEmail,
    Instant createdAt,
    Instant expiresAt
) {
}
