package com.capvault.backend.response;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResponseAcceptanceRepository extends JpaRepository<ResponseAcceptance, UUID> {
    java.util.List<ResponseAcceptance> findAllByResponseIdInAndRevokedAtIsNull(java.util.List<UUID> responseIds);

    Optional<ResponseAcceptance> findByResponseId(UUID responseId);

    Optional<ResponseAcceptance> findByResponseIdAndRevokedAtIsNull(UUID responseId);
}
