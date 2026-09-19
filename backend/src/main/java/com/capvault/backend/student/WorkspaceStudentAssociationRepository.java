package com.capvault.backend.student;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceStudentAssociationRepository extends JpaRepository<WorkspaceStudentAssociation, UUID> {

    Optional<WorkspaceStudentAssociation> findByWorkspaceIdAndGoogleSubject(UUID workspaceId, String googleSubject);

    Optional<WorkspaceStudentAssociation> findByWorkspaceIdAndGoogleSubjectAndActiveTrue(UUID workspaceId, String googleSubject);

    List<WorkspaceStudentAssociation> findAllByWorkspaceIdAndStudentRecordIdAndActiveTrueOrderByUpdatedAtDesc(
        UUID workspaceId, UUID studentRecordId);

    List<WorkspaceStudentAssociation> findAllByStudentNumberIgnoreCaseAndActiveTrueOrderByUpdatedAtDesc(String studentNumber);

    List<WorkspaceStudentAssociation> findAllByStudentNumberIgnoreCaseOrderByUpdatedAtDesc(String studentNumber);
}
