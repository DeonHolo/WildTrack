package com.capvault.backend.project;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectMetadataRepository extends JpaRepository<ProjectMetadata, UUID> {

    List<ProjectMetadata> findAllByWorkspaceIdOrderByGroupCodeAsc(UUID workspaceId);

    Optional<ProjectMetadata> findByWorkspaceIdAndGroupCodeIgnoreCase(UUID workspaceId, String groupCode);
}
