package com.capvault.backend.deliverable;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliverableFieldRepository extends JpaRepository<DeliverableField, String> {
    List<DeliverableField> findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(UUID deliverableId);
    List<DeliverableField> findAllByDeliverableIdAndActiveTrueOrderByDisplayOrderAscLabelAsc(UUID deliverableId);
    Optional<DeliverableField> findByIdAndDeliverableId(String id, UUID deliverableId);
    Optional<DeliverableField> findByDeliverableIdAndFieldKey(UUID deliverableId, String fieldKey);
}
