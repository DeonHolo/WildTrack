package com.capvault.backend.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

import org.springframework.stereotype.Service;

@Service
public class WildTrackSessionService {

    private final WildTrackSessionStore store;
    private final Clock clock;
    private final Duration sessionTtl;
    private final SecureRandom secureRandom = new SecureRandom();

    public WildTrackSessionService(WildTrackSessionStore store, Clock clock, Duration sessionTtl) {
        this.store = store;
        this.clock = clock;
        this.sessionTtl = sessionTtl;
    }

    public WildTrackSession create(GoogleIdentity identity) {
        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        String tokenHash = sha256Hex(rawToken);
        Instant now = clock.instant();
        store.save(new StoredWildTrackSession(
            tokenHash,
            identity.subject(),
            identity.email(),
            now,
            now.plus(sessionTtl)
        ));
        return new WildTrackSession(rawToken, tokenHash);
    }

    public Optional<StoredWildTrackSession> resolve(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        return store.findByTokenHash(sha256Hex(rawToken))
            .filter(session -> session.expiresAt().isAfter(clock.instant()));
    }

    public void revoke(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        store.deleteByTokenHash(sha256Hex(rawToken));
    }

    public void revokeAllForSubject(String googleSubject) {
        store.deleteAllByGoogleSubject(googleSubject);
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
