package com.capvault.backend.student;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentIdentityConflictRepository extends JpaRepository<StudentIdentityConflict, UUID> {

    List<StudentIdentityConflict> findAllByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    List<StudentIdentityConflict> findAllByWorkspaceIdAndStatusOrderByCreatedAtDesc(UUID workspaceId, String status);
}
