package com.capvault.backend.sheets;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SheetImportRunRepository extends JpaRepository<SheetImportRun, UUID> {

    List<SheetImportRun> findTop20ByWorkspaceIdOrderByStartedAtDesc(UUID workspaceId);
}
