package com.capvault.backend.student;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentIdentityConflictRepository extends JpaRepository<StudentIdentityConflict, UUID> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from StudentIdentityConflict c where c.id = :id")
    java.util.Optional<StudentIdentityConflict> findForDecision(@org.springframework.data.repository.query.Param("id") UUID id);

    List<StudentIdentityConflict> findAllByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    List<StudentIdentityConflict> findAllByWorkspaceIdAndStatusOrderByCreatedAtDesc(UUID workspaceId, String status);
}
