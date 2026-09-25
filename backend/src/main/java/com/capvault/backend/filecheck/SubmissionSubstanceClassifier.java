package com.capvault.backend.filecheck;

final class SubmissionSubstanceClassifier {

    private SubmissionSubstanceClassifier() { }

    static SubmissionSubstanceResult classify(
        FileCheckProperties properties,
        PdfInspection inspection,
        TemplateComparison comparison,
        Integer templateCharacterCount
    ) {
        int characters = Math.max(0, inspection.extractedCharacterCount());
        int pages = Math.max(0, inspection.pageCount());
        int textBearingPages = Math.max(0, inspection.textBearingPageCount());
        double textPageRatio = ratio(textBearingPages, pages);
        double charactersPerTextBearingPage = ratio(characters, textBearingPages);

        boolean templateAvailable = comparison != null
            && comparison.available()
            && templateCharacterCount != null
            && templateCharacterCount > 0;
        Double templateCoverage = templateAvailable ? comparison.templateCoverage() : null;
        Double addedContentRatio = templateAvailable ? comparison.addedContentRatio() : null;
        Double characterGrowthRatio = templateAvailable
            ? ratio(characters, templateCharacterCount)
            : null;

        SubmissionSubstanceResult.Evidence evidence = new SubmissionSubstanceResult.Evidence(
            templateAvailable,
            characters,
            pages,
            textBearingPages,
            round(textPageRatio),
            round(charactersPerTextBearingPage),
            templateAvailable ? templateCharacterCount : null,
            templateCoverage,
            addedContentRatio,
            characterGrowthRatio == null ? null : round(characterGrowthRatio)
        );

        if (characters < properties.minimumAssessableCharacters() || textBearingPages == 0) {
            return new SubmissionSubstanceResult(
                SubmissionSubstanceResult.COULD_NOT_DETERMINE,
                SubmissionSubstanceResult.INSUFFICIENT_TEXT_EXTRACTION,
                "The PDF opens, but there is not enough extractable text to assess whether it is substantially filled.",
                evidence
            );
        }

        if (characters < properties.minimumSubstantialCharacters()
                || textPageRatio < properties.minimumTextPageRatio()
                || charactersPerTextBearingPage < properties.minimumCharactersPerTextBearingPage()) {
            return new SubmissionSubstanceResult(
                SubmissionSubstanceResult.NEEDS_ATTENTION,
                SubmissionSubstanceResult.SPARSE_CONTENT,
                "The PDF contains too little extractable text across its pages to look substantially filled.",
                evidence
            );
        }

        if (!templateAvailable) {
            return new SubmissionSubstanceResult(
                SubmissionSubstanceResult.LOOKS_SUBSTANTIALLY_FILLED,
                SubmissionSubstanceResult.SUBSTANTIAL_NO_TEMPLATE,
                "WildTrack found substantial extractable content. No official template was available for comparison.",
                evidence
            );
        }

        if (comparison.addedContentRatio() >= properties.minimumSubstanceAddedContentRatio()
                || characterGrowthRatio >= properties.minimumSubstanceCharacterGrowthRatio()) {
            return new SubmissionSubstanceResult(
                SubmissionSubstanceResult.LOOKS_SUBSTANTIALLY_FILLED,
                SubmissionSubstanceResult.SUBSTANTIAL_CONTENT,
                "WildTrack found substantial content beyond the official template.",
                evidence
            );
        }

        return new SubmissionSubstanceResult(
            SubmissionSubstanceResult.NEEDS_ATTENTION,
            SubmissionSubstanceResult.TEMPLATE_LIKE,
            "The PDF still appears largely unchanged from the official template.",
            evidence
        );
    }

    private static double ratio(double numerator, double denominator) {
        return denominator <= 0 ? 0 : numerator / denominator;
    }

    private static double round(double value) {
        return Math.round(value * 10_000.0) / 10_000.0;
    }
}
