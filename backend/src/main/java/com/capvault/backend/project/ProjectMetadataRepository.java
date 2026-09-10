package com.capvault.backend.project;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectMetadataRepository extends JpaRepository<ProjectMetadata, UUID> {

    List<ProjectMetadata> findAllByWorkspaceIdOrderByGroupCodeAsc(UUID workspaceId);

    Optional<ProjectMetadata> findByWorkspaceIdAndGroupCodeIgnoreCase(UUID workspaceId, String groupCode);

    Optional<ProjectMetadata> findByWorkspaceIdAndCurrentGroupCodeIgnoreCase(UUID workspaceId, String currentGroupCode);

    default Optional<ProjectMetadata> findForCurrentTeam(UUID workspaceId, String teamCode) {
        return findByWorkspaceIdAndCurrentGroupCodeIgnoreCase(workspaceId, teamCode)
            .or(() -> findByWorkspaceIdAndGroupCodeIgnoreCase(workspaceId, teamCode));
    }
}
