package com.capvault.backend.tracker;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TrackerWritebackRepository extends JpaRepository<TrackerWriteback, UUID> {

    List<TrackerWriteback> findTop50ByWorkspaceIdOrderByRequestedAtDesc(UUID workspaceId);
}
