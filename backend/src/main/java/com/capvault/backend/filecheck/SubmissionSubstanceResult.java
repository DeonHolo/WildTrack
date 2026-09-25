package com.capvault.backend.filecheck;

public record SubmissionSubstanceResult(
    String state,
    String reasonCode,
    String reason,
    Evidence evidence
) {
    public static final String LOOKS_SUBSTANTIALLY_FILLED = "LOOKS_SUBSTANTIALLY_FILLED";
    public static final String NEEDS_ATTENTION = "NEEDS_ATTENTION";
    public static final String COULD_NOT_DETERMINE = "COULD_NOT_DETERMINE";
    public static final String SUBSTANTIAL_CONTENT = "SUBSTANTIAL_CONTENT";
    public static final String SUBSTANTIAL_NO_TEMPLATE = "SUBSTANTIAL_NO_TEMPLATE";
    public static final String SPARSE_CONTENT = "SPARSE_CONTENT";
    public static final String TEMPLATE_LIKE = "TEMPLATE_LIKE";
    public static final String INSUFFICIENT_TEXT_EXTRACTION = "INSUFFICIENT_TEXT_EXTRACTION";

    public boolean attentionRequired() {
        return !LOOKS_SUBSTANTIALLY_FILLED.equals(state);
    }

    public record Evidence(
        boolean templateAvailable,
        int extractedCharacterCount,
        int pageCount,
        int textBearingPageCount,
        double textPageRatio,
        double charactersPerTextBearingPage,
        Integer templateCharacterCount,
        Double templateCoverage,
        Double addedContentRatio,
        Double characterGrowthRatio
    ) { }
}
