package com.capvault.backend.draft;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface FormResponseDraftRepository extends JpaRepository<FormResponseDraft, UUID> {

    Optional<FormResponseDraft> findByWorkspaceIdAndDeliverableIdAndGoogleSubject(UUID workspaceId, UUID deliverableId, String googleSubject);

    @Modifying
    @Query("DELETE FROM FormResponseDraft d WHERE d.expiresAt < :now")
    int deleteAllExpired(java.time.Instant now);
}
