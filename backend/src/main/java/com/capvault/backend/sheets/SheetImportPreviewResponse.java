package com.capvault.backend.sheets;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.workspace.WorkspaceSourceType;

public record SheetImportPreviewResponse(
    UUID previewId,
    WorkspaceSourceType sourceType,
    String stateVersion,
    String sourceVersion,
    int addedRows,
    int changedRows,
    int missingRows,
    List<Change> changes,
    List<String> warnings,
    List<DeadlineSuggestionResponse> deadlineSuggestions,
    SheetImportDetails details
) {
    public record Change(
        String key,
        String entityType,
        String rowKey,
        String rowLabel,
        String kind,
        List<FieldChange> fields
    ) {
    }

    public record FieldChange(
        String key,
        String field,
        String label,
        String sourceValue,
        String localValue,
        boolean conflict
    ) {
    }
}
