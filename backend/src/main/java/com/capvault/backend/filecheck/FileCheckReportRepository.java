package com.capvault.backend.filecheck;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FileCheckReportRepository extends JpaRepository<FileCheckReport, UUID> {
    @org.springframework.data.jpa.repository.Query("""
        select r from FileCheckReport r where r.workspaceId = :workspaceId
        and r.externalResponseId in :responseIds and not exists
        (select newer.id from FileCheckReport newer where newer.workspaceId = r.workspaceId
         and newer.externalResponseId = r.externalResponseId and newer.checkedAt > r.checkedAt)
        order by r.checkedAt desc
        """)
    List<FileCheckReport> findLatestForResponses(UUID workspaceId, List<String> responseIds);

    Optional<FileCheckReport> findFirstByWorkspaceIdAndExternalResponseIdOrderByCheckedAtDesc(
        UUID workspaceId,
        String externalResponseId
    );

    List<FileCheckReport> findAllByWorkspaceIdAndExternalResponseIdOrderByCheckedAtDesc(
        UUID workspaceId,
        String externalResponseId
    );
}
