package com.capvault.backend.auth;

import java.util.Optional;

public interface WildTrackSessionStore {
    void save(StoredWildTrackSession session);

    Optional<StoredWildTrackSession> findByTokenHash(String tokenHash);

    void deleteByTokenHash(String tokenHash);

    void deleteAllByGoogleSubject(String googleSubject);
}
