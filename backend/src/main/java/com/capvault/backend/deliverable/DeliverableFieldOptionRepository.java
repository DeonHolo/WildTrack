package com.capvault.backend.deliverable;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliverableFieldOptionRepository extends JpaRepository<DeliverableFieldOption, String> {

    List<DeliverableFieldOption> findAllByFieldIdOrderByDisplayOrderAscLabelAsc(String fieldId);

    List<DeliverableFieldOption> findAllByFieldIdInOrderByFieldIdAscDisplayOrderAscLabelAsc(Collection<String> fieldIds);
}
