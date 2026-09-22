package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class AiReviewExistingHeadingAndFormattingTest {
    private static final String TEMPLATE = """
        2. Overall Description
        Describe the current system and its working environment.
        2.4 Constraints
        • Users require an active network connection.
        • Uploaded files must use PDF format.
        2.5 Assumptions and dependencies
        Sample project assumptions.
        """;
    private static final String PRESENT = """
        Software Requirements Specification
        2. Overall Description
        WildTrack is a student capstone document submission system.
        2.4. Constraints
        • A network connection is required when uploading a PDF.
        • Reviewers need an authorized account to access documents.
        2.5 Assumptions and dependencies
        Internet access is assumed for the sample environment.
        """;

    private static AiReviewProvider.Finding finding(String issue, AiReviewProvider.FindingSource source,
            String requirement) {
        return new AiReviewProvider.Finding(issue, source, "Page 2, 2.4 Constraints", requirement);
    }

    private static AiReviewProvider.Result process(List<AiReviewProvider.Finding> findings,
            String document, String instructions) {
        return AiReviewService.postprocessForBenchmark(new AiReviewProvider.Result(
            "Provider summary", findings, List.of(), List.of(), "Provider action"),
            "Software Requirements Specification", instructions, TEMPLATE, document);
    }

    @Test void presentConstraintsHeadingDoesNotBecomeMissingThroughRegularFindings() {
        var quoted = finding("The '2.4 Constraints' section is missing from the submitted body.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, "2.4 Constraints");
        var unquoted = finding("Section 2.4 Constraints is absent from the document body.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, "2.4 Constraints");
        var directlyNamed = finding("2.4 Constraints is missing from the document body.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, "2.4 Constraints");
        var document = finding("The '2.4 Constraints' section is not present in the document.",
            AiReviewProvider.FindingSource.DOCUMENT, "");

        var result = process(List.of(quoted, unquoted, directlyNamed, document), PRESENT, "");
        assertThat(result.findings()).isEmpty();
        assertThat(result.summary()).doesNotContain("Constraints section is missing", "Constraints is absent");
    }

    @Test void actualMissingHeadingIsRetainedAndPresentHeadingWithThinContentCanStillBeCriticized() {
        var missing = finding("The '2.4 Constraints' section is missing from the submitted body.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, "2.4 Constraints");
        var thin = finding("Section 2.4 Constraints is present but contains placeholder content.",
            AiReviewProvider.FindingSource.DOCUMENT, "");
        var missingContent = finding("The 2.4 Constraints section is missing descriptive content.",
            AiReviewProvider.FindingSource.DOCUMENT, "");
        var without = PRESENT.replace("2.4. Constraints\n", "");
        assertThat(process(List.of(missing), without, "").findings()).contains(missing);
        assertThat(process(List.of(thin, missingContent), PRESENT, "").findings())
            .contains(thin, missingContent);
    }

    @Test void sampleBulletsDoNotEstablishAnUnwrittenParagraphRequirement() {
        var claimedTemplateRule = finding(
            "The 2.4 Constraints section uses bullet points instead of required prose paragraphs.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, "2.4 Constraints");
        var inventedDocumentRule = finding(
            "Section 2.4 Constraints is incorrectly bulleted and must be written in paragraph form.",
            AiReviewProvider.FindingSource.DOCUMENT, "");

        assertThat(process(List.of(claimedTemplateRule, inventedDocumentRule), PRESENT, "").findings())
            .isEmpty();
    }

    @Test void explicitlyRequiredProseAndActualWrongDeliverableFindingRemainVisible() {
        var explicit = finding("The Constraints section uses bullets rather than the required prose.",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
            "The Constraints section must be written in prose.");
        var wrong = finding("The PDF identifies itself as a Software Project Management Plan rather than the requested SRS.",
            AiReviewProvider.FindingSource.DOCUMENT, "");
        var listedWrong = finding("The PDF is a bullet list titled Software Project Management Plan, which is the wrong deliverable rather than an SRS.",
            AiReviewProvider.FindingSource.DOCUMENT, "");
        var document = "Software Project Management Plan\nProject schedule and risk register.";
        assertThat(process(List.of(explicit, wrong, listedWrong), document,
            "The Constraints section must be written in prose.").findings()).containsExactly(explicit, wrong, listedWrong);
    }
}
