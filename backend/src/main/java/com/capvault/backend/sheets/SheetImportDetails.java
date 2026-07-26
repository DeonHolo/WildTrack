package com.capvault.backend.sheets;

import java.util.List;
import java.util.Map;

public record SheetImportDetails(
    boolean sourceSignatureValid,
    Integer headerRow,
    List<String> detectedFields,
    List<String> missingFields,
    Map<String, Integer> metrics,
    Integer deadlineRows
) {
}

