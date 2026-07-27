package com.capvault.backend.filecheck;

import java.util.List;

public record TemplateComparison(
    boolean available,
    double templateCoverage,
    double addedContentRatio,
    int unchangedInstructionCount,
    List<String> missingTemplateHeadings,
    boolean appearsTemplateOnly
) {
    public static TemplateComparison unavailable() {
        return new TemplateComparison(false, 0, 0, 0, List.of(), false);
    }
}
