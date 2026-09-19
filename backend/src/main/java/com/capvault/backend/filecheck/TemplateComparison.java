package com.capvault.backend.filecheck;

import java.util.List;

public record TemplateComparison(
    boolean available,
    double templateCoverage,
    double addedContentRatio,
    int unchangedInstructionCount,
    List<String> missingTemplateHeadings,
    boolean appearsTemplateOnly,
    List<String> expectedTemplateHeadings,
    List<String> detectedTemplateHeadings
) {
    public TemplateComparison {
        missingTemplateHeadings = missingTemplateHeadings == null ? List.of() : List.copyOf(missingTemplateHeadings);
        expectedTemplateHeadings = expectedTemplateHeadings == null ? List.of() : List.copyOf(expectedTemplateHeadings);
        detectedTemplateHeadings = detectedTemplateHeadings == null ? List.of() : List.copyOf(detectedTemplateHeadings);
    }

    public TemplateComparison(
        boolean available,
        double templateCoverage,
        double addedContentRatio,
        int unchangedInstructionCount,
        List<String> missingTemplateHeadings,
        boolean appearsTemplateOnly
    ) {
        this(available, templateCoverage, addedContentRatio, unchangedInstructionCount,
            missingTemplateHeadings, appearsTemplateOnly, List.of(), List.of());
    }

    public static TemplateComparison unavailable() {
        return new TemplateComparison(false, 0, 0, 0, List.of(), false, List.of(), List.of());
    }
}
