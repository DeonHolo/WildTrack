package com.capvault.backend.workspace;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceSourceService {

    private static final Pattern SHEET_ID_PATTERN = Pattern.compile("/spreadsheets/d/(?:e/)?([^/?#]+)");

    private final WorkspaceSourceRepository repository;

    public WorkspaceSourceService(WorkspaceSourceRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<WorkspaceSourceResponse> listSources(UUID workspaceId) {
        return repository.findAllByWorkspaceIdOrderBySourceTypeAsc(workspaceId)
            .stream()
            .map(WorkspaceSourceResponse::from)
            .toList();
    }

    @Transactional
    public WorkspaceSourceResponse upsertSource(UUID workspaceId, WorkspaceSourceType sourceType, WorkspaceSourceRequest request) {
        String sheetUrl = request.sheetUrl().trim();
        String sheetId = extractSheetId(sheetUrl);
        WorkspaceSourceStatus status = request.status() == null ? WorkspaceSourceStatus.CONNECTED : request.status();
        String displayName = normalizeNullable(request.displayName());

        WorkspaceSource source = repository.findByWorkspaceIdAndSourceType(workspaceId, sourceType)
            .orElseGet(() -> new WorkspaceSource(
                workspaceId,
                sourceType,
                sheetUrl,
                sheetId,
                displayName,
                status,
                LocalDateTime.now()
            ));

        source.setSheetUrl(sheetUrl);
        source.setSheetId(sheetId);
        source.setDisplayName(displayName);
        source.setStatus(status);
        if (status == WorkspaceSourceStatus.IMPORTED) {
            source.setLastImportedAt(LocalDateTime.now());
        }

        return WorkspaceSourceResponse.from(repository.save(source));
    }

    static String extractSheetId(String value) {
        String trimmed = value == null ? "" : value.trim();
        Matcher matcher = SHEET_ID_PATTERN.matcher(trimmed);
        if (matcher.find()) {
            return matcher.group(1);
        }
        int queryIndex = trimmed.indexOf('?');
        String withoutQuery = queryIndex >= 0 ? trimmed.substring(0, queryIndex) : trimmed;
        return withoutQuery.replaceAll("/+$", "");
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
