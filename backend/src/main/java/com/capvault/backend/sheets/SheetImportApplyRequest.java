package com.capvault.backend.sheets;

import java.util.Map;
import java.util.UUID;

public record SheetImportApplyRequest(
    UUID previewId,
    Map<String, String> resolutions
) {
}
