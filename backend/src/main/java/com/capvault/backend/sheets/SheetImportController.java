package com.capvault.backend.sheets;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.workspace.WorkspaceSourceType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sheets")
public class SheetImportController {

    private final SheetImportService sheetImportService;
    private final StudentAssociationSecurity security;

    public SheetImportController(SheetImportService sheetImportService, StudentAssociationSecurity security) {
        this.sheetImportService = sheetImportService;
        this.security = security;
    }

    @PostMapping("/import/{sourceType}")
    public SheetImportResponse importSource(
        @PathVariable WorkspaceSourceType sourceType,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @RequestBody(required = false) SheetImportRequest request
    ) {
        return sheetImportService.importSource(workspaceId, sourceType, request);
    }

    @GetMapping("/import-runs")
    public List<SheetImportRunResponse> listImportRuns(
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId
    ) {
        return sheetImportService.listImportRuns(workspaceId);
    }

    @PostMapping("/preview/{sourceType}")
    public SheetImportPreviewResponse previewSource(
        @PathVariable WorkspaceSourceType sourceType,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @RequestBody(required = false) SheetImportRequest request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        return sheetImportService.previewSource(workspaceId, sourceType, request);
    }

    @PostMapping("/apply/{sourceType}")
    public SheetImportResponse applyPreview(
        @PathVariable WorkspaceSourceType sourceType,
        @RequestParam(defaultValue = "11111111-1111-1111-1111-111111111111") UUID workspaceId,
        @RequestBody SheetImportApplyRequest request,
        HttpServletRequest http
    ) {
        requireAdmin(http);
        return sheetImportService.applyPreview(workspaceId, sourceType, request);
    }

    private void requireAdmin(HttpServletRequest http) {
        if (!security.activeRoles(http).contains(StaffRole.ADMIN)) {
            throw new AccessDeniedException("Admin authorization required.");
        }
    }
}
