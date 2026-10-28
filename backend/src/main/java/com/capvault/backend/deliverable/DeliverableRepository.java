package com.capvault.backend.deliverable;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliverableRepository extends JpaRepository<Deliverable, UUID> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select d from Deliverable d where d.id = :id")
    Optional<Deliverable> lockById(@org.springframework.data.repository.query.Param("id") UUID id);

    Optional<Deliverable> findByWorkspaceIdAndSlug(UUID workspaceId, String slug);

    boolean existsByWorkspaceIdAndSlug(UUID workspaceId, String slug);

    boolean existsByWorkspaceIdAndSlugAndIdNot(UUID workspaceId, String slug, UUID id);

    List<Deliverable> findAllByWorkspaceIdOrderByDueAtAscTitleAsc(UUID workspaceId);
}
