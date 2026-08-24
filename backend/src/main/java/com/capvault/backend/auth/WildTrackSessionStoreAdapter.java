package com.capvault.backend.auth;

import java.util.Optional;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class WildTrackSessionStoreAdapter implements WildTrackSessionStore {

    private final WildTrackSessionJpaRepository jpaRepository;

    public WildTrackSessionStoreAdapter(WildTrackSessionJpaRepository jpaRepository) {
        this.jpaRepository = jpaRepository;
    }

    @Override
    @Transactional
    public void save(StoredWildTrackSession session) {
        WildTrackSessionEntity existing = jpaRepository.findById(session.tokenHash()).orElse(null);
        if (existing == null) {
            existing = new WildTrackSessionEntity(
                session.tokenHash(),
                session.googleSubject(),
                session.googleEmail(),
                session.createdAt(),
                session.expiresAt()
            );
        }
        jpaRepository.save(existing);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<StoredWildTrackSession> findByTokenHash(String tokenHash) {
        return jpaRepository.findByTokenHash(tokenHash)
            .map(entity -> new StoredWildTrackSession(
                entity.getTokenHash(),
                entity.getGoogleSubject(),
                entity.getGoogleEmail(),
                entity.getCreatedAt(),
                entity.getExpiresAt()
            ));
    }

    @Override
    @Transactional
    public void deleteByTokenHash(String tokenHash) {
        jpaRepository.deleteById(tokenHash);
    }

    @Override
    @Transactional
    public void deleteAllByGoogleSubject(String googleSubject) {
        jpaRepository.deleteByGoogleSubject(googleSubject);
    }
}
