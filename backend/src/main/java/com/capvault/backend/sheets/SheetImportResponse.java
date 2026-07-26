package com.capvault.backend.sheets;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import com.capvault.backend.workspace.WorkspaceSourceType;

public record SheetImportResponse(
    UUID importRunId,
    WorkspaceSourceType sourceType,
    SheetImportStatus status,
    Integer rowsFound,
    Integer columnsFound,
    Integer studentsFound,
    Integer officialIdsFound,
    Integer groupsFound,
    List<String> warnings,
    List<DeadlineSuggestionResponse> deadlineSuggestions,
    SheetImportDetails details,
    LocalDateTime importedAt
) {
}
