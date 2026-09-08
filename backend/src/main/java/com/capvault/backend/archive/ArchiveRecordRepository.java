package com.capvault.backend.archive;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ArchiveRecordRepository extends JpaRepository<ArchiveRecord, UUID> {
    List<ArchiveRecord> findAllByWorkspaceIdOrderByArchivedAtDesc(UUID workspaceId);
    Optional<ArchiveRecord> findByResponseIdAndSourceResponseUpdatedAt(UUID responseId, Instant sourceResponseUpdatedAt);
    long countByResponseId(UUID responseId);
}
