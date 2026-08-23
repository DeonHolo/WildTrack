package com.capvault.backend.auth;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WildTrackSessionJpaRepository extends JpaRepository<WildTrackSessionEntity, String> {

    Optional<WildTrackSessionEntity> findByTokenHash(String tokenHash);

    void deleteByGoogleSubject(String googleSubject);
}
