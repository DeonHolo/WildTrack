package com.capvault.backend.response;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CanonicalResponseSelectionRepository extends JpaRepository<CanonicalResponseSelection, UUID> {

    java.util.List<CanonicalResponseSelection> findAllByWorkspaceIdAndDeliverableIdAndStudentRecordIdOrderByCreatedAtDesc(
        UUID workspaceId, UUID deliverableId, UUID studentRecordId);

    Optional<CanonicalResponseSelection> findFirstByWorkspaceIdAndDeliverableIdAndStudentRecordIdOrderByCreatedAtDesc(
        UUID workspaceId, UUID deliverableId, UUID studentRecordId);
}
