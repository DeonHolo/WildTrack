package com.capvault.backend.staff;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AdviserTeamAssignmentRepository extends JpaRepository<AdviserTeamAssignment, UUID> {

    List<AdviserTeamAssignment> findAllByWorkspaceId(UUID workspaceId);

    List<AdviserTeamAssignment> findAllByGoogleSubjectAndWorkspaceId(String googleSubject, UUID workspaceId);

    void deleteByWorkspaceIdAndGoogleSubjectAndTeamCode(UUID workspaceId, String googleSubject, String teamCode);
}
