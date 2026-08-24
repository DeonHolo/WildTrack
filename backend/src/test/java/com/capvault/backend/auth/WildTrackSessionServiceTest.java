package com.capvault.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WildTrackSessionServiceTest {

    private static final GoogleIdentity IDENTITY = new GoogleIdentity(
        "google-subject-123",
        "student@gmail.com",
        "Student Name",
        ""
    );
    private static final Instant NOW = Instant.parse("2026-08-24T00:00:00Z");
    private static final Duration SESSION_TTL = Duration.ofHours(12);

    private WildTrackSessionService service(Clock clock, WildTrackSessionStore store) {
        return new WildTrackSessionService(store, clock, SESSION_TTL);
    }

    @Test
    void createsSessionWithHashedIdentifierOnly() {
        InMemorySessionRepository repository = new InMemorySessionRepository();
        WildTrackSessionService service = service(Clock.fixed(NOW, ZoneOffset.UTC), repository);

        WildTrackSession session = service.create(IDENTITY);

        assertThat(session.rawToken()).isNotBlank();
        assertThat(session.rawToken()).doesNotContain(IDENTITY.subject());
        StoredWildTrackSession stored = repository.findByTokenHash(session.tokenHash()).orElseThrow();
        assertThat(stored.googleSubject()).isEqualTo("google-subject-123");
        assertThat(stored.expiresAt()).isEqualTo(NOW.plus(SESSION_TTL));
    }

    @Test
    void resolvesValidUnexpiredSession() {
        InMemorySessionRepository repository = new InMemorySessionRepository();
        WildTrackSessionService service = service(Clock.fixed(NOW, ZoneOffset.UTC), repository);
        WildTrackSession created = service.create(IDENTITY);

        Optional<StoredWildTrackSession> resolved = service.resolve(created.rawToken());

        assertThat(resolved).isPresent();
        assertThat(resolved.get().googleSubject()).isEqualTo("google-subject-123");
    }

    @Test
    void rejectsExpiredSessions() {
        InMemorySessionRepository repository = new InMemorySessionRepository();
        WildTrackSessionService service = service(Clock.fixed(NOW, ZoneOffset.UTC), repository);
        WildTrackSession created = service.create(IDENTITY);

        Clock later = Clock.fixed(NOW.plus(Duration.ofHours(13)), ZoneOffset.UTC);
        WildTrackSessionService laterService = service(later, repository);

        assertThat(laterService.resolve(created.rawToken())).isEmpty();
    }

    @Test
    void rejectsMalformedOrUnknownTokens() {
        InMemorySessionRepository repository = new InMemorySessionRepository();
        WildTrackSessionService service = service(Clock.fixed(NOW, ZoneOffset.UTC), repository);

        assertThat(service.resolve("")).isEmpty();
        assertThat(service.resolve(null)).isEmpty();
        assertThat(service.resolve("not-a-real-token")).isEmpty();
    }

    @Test
    void revocationPreventsFurtherUse() {
        InMemorySessionRepository repository = new InMemorySessionRepository();
        WildTrackSessionService service = service(Clock.fixed(NOW, ZoneOffset.UTC), repository);
        WildTrackSession created = service.create(IDENTITY);

        service.revoke(created.rawToken());

        assertThat(service.resolve(created.rawToken())).isEmpty();
    }

    @Test
    void revokedBySubjectAlsoInvalidatesExistingSessions() {
        InMemorySessionRepository repository = new InMemorySessionRepository();
        WildTrackSessionService service = service(Clock.fixed(NOW, ZoneOffset.UTC), repository);
        WildTrackSession first = service.create(IDENTITY);
        WildTrackSession second = service.create(IDENTITY);

        service.revokeAllForSubject(IDENTITY.subject());

        assertThat(service.resolve(first.rawToken())).isEmpty();
        assertThat(service.resolve(second.rawToken())).isEmpty();
    }

    static final class InMemorySessionRepository implements WildTrackSessionStore {
        private final Map<String, StoredWildTrackSession> sessions = new HashMap<>();

        @Override
        public void save(StoredWildTrackSession session) {
            sessions.put(session.tokenHash(), session);
        }

        @Override
        public Optional<StoredWildTrackSession> findByTokenHash(String tokenHash) {
            return Optional.ofNullable(sessions.get(tokenHash));
        }

        @Override
        public void deleteByTokenHash(String tokenHash) {
            sessions.remove(tokenHash);
        }

        @Override
        public void deleteAllByGoogleSubject(String googleSubject) {
            sessions.values().removeIf(session -> session.googleSubject().equals(googleSubject));
        }
    }
}
