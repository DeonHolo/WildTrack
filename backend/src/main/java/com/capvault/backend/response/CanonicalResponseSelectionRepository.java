package com.capvault.backend.response;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CanonicalResponseSelectionRepository extends JpaRepository<CanonicalResponseSelection, UUID> {

    Optional<CanonicalResponseSelection> findFirstByWorkspaceIdAndDeliverableIdAndStudentRecordIdOrderByCreatedAtDesc(
        UUID workspaceId, UUID deliverableId, UUID studentRecordId);
}
