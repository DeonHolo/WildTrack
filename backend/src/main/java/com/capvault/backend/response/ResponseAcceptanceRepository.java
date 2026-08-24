package com.capvault.backend.response;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResponseAcceptanceRepository extends JpaRepository<ResponseAcceptance, UUID> {

    Optional<ResponseAcceptance> findByResponseIdAndRevokedAtIsNull(UUID responseId);
}
