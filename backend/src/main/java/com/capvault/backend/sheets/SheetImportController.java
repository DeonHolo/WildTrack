package com.capvault.backend.sheets;

import java.util.List;
import java.util.UUID;

import com.capvault.backend.workspace.WorkspaceSourceType;
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

    public SheetImportController(SheetImportService sheetImportService) {
        this.sheetImportService = sheetImportService;
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
}
