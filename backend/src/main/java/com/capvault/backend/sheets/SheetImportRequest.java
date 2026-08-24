package com.capvault.backend.sheets;

import java.util.Map;

public record SheetImportRequest(
    String sheetUrl,
    String displayName,
    Map<String, String> mappingOverrides
) {
}
