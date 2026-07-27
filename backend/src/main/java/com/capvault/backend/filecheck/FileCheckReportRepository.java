package com.capvault.backend.filecheck;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FileCheckReportRepository extends JpaRepository<FileCheckReport, UUID> {

    Optional<FileCheckReport> findFirstByWorkspaceIdAndExternalResponseIdOrderByCheckedAtDesc(
        UUID workspaceId,
        String externalResponseId
    );

    List<FileCheckReport> findAllByWorkspaceIdAndExternalResponseIdOrderByCheckedAtDesc(
        UUID workspaceId,
        String externalResponseId
    );
}
