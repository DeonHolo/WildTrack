package com.capvault.backend.tracker;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TrackerRowRepository extends JpaRepository<TrackerRow, UUID> {

    List<TrackerRow> findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(UUID workspaceId);

    Optional<TrackerRow> findByWorkspaceIdAndStudentNumberIgnoreCase(UUID workspaceId, String studentNumber);

    Optional<TrackerRow> findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCase(
        UUID workspaceId,
        String teamCode,
        String memberNumber
    );

    Optional<TrackerRow> findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCaseAndStudentNameIgnoreCase(
        UUID workspaceId,
        String teamCode,
        String memberNumber,
        String studentName
    );
}
