package com.capvault.backend.template;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DocumentTemplateRepository extends JpaRepository<DocumentTemplate, UUID> {

    List<DocumentTemplate> findAllByWorkspaceIdOrderByDeliverableKeyAsc(UUID workspaceId);

    Optional<DocumentTemplate> findByWorkspaceIdAndDeliverableKeyIgnoreCase(
        UUID workspaceId,
        String deliverableKey
    );
}
