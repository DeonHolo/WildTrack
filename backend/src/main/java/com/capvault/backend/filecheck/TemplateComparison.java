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
    List<String> detectedTemplateHeadings,
    List<SectionEvidence> sectionEvidence
) {
    public TemplateComparison {
        missingTemplateHeadings = missingTemplateHeadings == null ? List.of() : List.copyOf(missingTemplateHeadings);
        expectedTemplateHeadings = expectedTemplateHeadings == null ? List.of() : List.copyOf(expectedTemplateHeadings);
        detectedTemplateHeadings = detectedTemplateHeadings == null ? List.of() : List.copyOf(detectedTemplateHeadings);
        sectionEvidence = sectionEvidence == null ? List.of() : List.copyOf(sectionEvidence);
    }

    /**
     * A heading-line observation, not a confidence estimate, page reference,
     * proof of substantive section content, or academic compliance decision.
     * Extracted-text line numbers are 1-based and may differ from PDF layout.
     */
    public record SectionEvidence(
        String expectedHeading,
        String status,
        String matchedLine,
        Integer extractedTextLine,
        String matchMethod
    ) { }

    public TemplateComparison(
        boolean available,
        double templateCoverage,
        double addedContentRatio,
        int unchangedInstructionCount,
        List<String> missingTemplateHeadings,
        boolean appearsTemplateOnly,
        List<String> expectedTemplateHeadings,
        List<String> detectedTemplateHeadings
    ) {
        this(available, templateCoverage, addedContentRatio, unchangedInstructionCount,
            missingTemplateHeadings, appearsTemplateOnly, expectedTemplateHeadings,
            detectedTemplateHeadings, List.of());
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
        return new TemplateComparison(false, 0, 0, 0, List.of(), false, List.of(), List.of(), List.of());
    }
}
