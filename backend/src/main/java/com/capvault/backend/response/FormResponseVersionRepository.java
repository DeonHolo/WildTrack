package com.capvault.backend.response;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FormResponseVersionRepository extends JpaRepository<FormResponseVersion, UUID> {

    List<FormResponseVersion> findAllByResponseIdOrderByRevisionAsc(UUID responseId);
}
