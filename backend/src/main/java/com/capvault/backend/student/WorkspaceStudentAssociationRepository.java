package com.capvault.backend.student;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceStudentAssociationRepository extends JpaRepository<WorkspaceStudentAssociation, UUID> {

    Optional<WorkspaceStudentAssociation> findByWorkspaceIdAndGoogleSubject(UUID workspaceId, String googleSubject);

    Optional<WorkspaceStudentAssociation> findByWorkspaceIdAndGoogleSubjectAndActiveTrue(UUID workspaceId, String googleSubject);

    Optional<WorkspaceStudentAssociation> findFirstByStudentRecordIdAndActiveTrueOrderByUpdatedAtDesc(UUID studentRecordId);

    boolean existsByWorkspaceIdAndStudentRecordIdAndGoogleSubjectNotAndActiveTrue(UUID workspaceId, UUID studentRecordId, String googleSubject);
}
