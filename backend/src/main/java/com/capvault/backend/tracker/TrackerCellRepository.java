package com.capvault.backend.tracker;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TrackerCellRepository extends JpaRepository<TrackerCell, UUID> {
    List<TrackerCell> findAllByTrackerRowIdIn(List<UUID> trackerRowIds);

    List<TrackerCell> findAllByTrackerRowId(UUID trackerRowId);

    Optional<TrackerCell> findByTrackerRowIdAndTrackerColumnId(UUID trackerRowId, UUID trackerColumnId);
}
