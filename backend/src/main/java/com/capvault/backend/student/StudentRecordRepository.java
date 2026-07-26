package com.capvault.backend.student;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentRecordRepository extends JpaRepository<StudentRecord, UUID> {

    List<StudentRecord> findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(UUID workspaceId);

    Optional<StudentRecord> findByWorkspaceIdAndStudentNumberIgnoreCase(UUID workspaceId, String studentNumber);

    Optional<StudentRecord> findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCase(
        UUID workspaceId,
        String teamCode,
        String memberNumber
    );
}
