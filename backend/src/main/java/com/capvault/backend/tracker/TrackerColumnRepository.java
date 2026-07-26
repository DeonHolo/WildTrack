package com.capvault.backend.tracker;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TrackerColumnRepository extends JpaRepository<TrackerColumn, UUID> {

    List<TrackerColumn> findAllByWorkspaceIdOrderByDisplayOrderAscLabelAsc(UUID workspaceId);

    Optional<TrackerColumn> findByWorkspaceIdAndColumnKeyIgnoreCase(UUID workspaceId, String columnKey);
}
