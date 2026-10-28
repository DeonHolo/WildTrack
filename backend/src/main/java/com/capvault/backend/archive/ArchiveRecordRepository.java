package com.capvault.backend.archive;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ArchiveRecordRepository extends JpaRepository<ArchiveRecord, UUID> {
    List<ArchiveRecord> findAllByWorkspaceIdOrderByArchivedAtDesc(UUID workspaceId);
    List<ArchiveRecord> findAllByResponseIdAndSourceResponseUpdatedAtOrderByArchivedAtDesc(UUID responseId, Instant sourceResponseUpdatedAt);
    default Optional<ArchiveRecord> findByResponseIdAndSourceResponseUpdatedAt(UUID responseId, Instant sourceResponseUpdatedAt) {
        return findAllByResponseIdAndSourceResponseUpdatedAtOrderByArchivedAtDesc(responseId, sourceResponseUpdatedAt).stream().findFirst();
    }
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select a from ArchiveRecord a where a.id = :id")
    Optional<ArchiveRecord> findByIdForUpdate(UUID id);
    long countByResponseId(UUID responseId);
}
