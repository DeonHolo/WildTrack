package com.capvault.backend.student;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentRecordRepository extends JpaRepository<StudentRecord, UUID> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select student from StudentRecord student where student.id = :id")
    Optional<StudentRecord> lockById(@org.springframework.data.repository.query.Param("id") UUID id);

    List<StudentRecord> findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(UUID workspaceId);

    Optional<StudentRecord> findByWorkspaceIdAndStudentNumberIgnoreCase(UUID workspaceId, String studentNumber);

    Optional<StudentRecord> findFirstByWorkspaceIdAndTeamCodeIgnoreCaseAndMemberNumberIgnoreCase(
        UUID workspaceId,
        String teamCode,
        String memberNumber
    );
}
