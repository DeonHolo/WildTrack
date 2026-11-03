package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.*;
import java.util.List;
import com.capvault.backend.filecheck.PdfInspection;
import org.junit.jupiter.api.Test;

class AiReviewApproximateReferenceTest {
    private static final String SENTENCE = "The application shall launch and display the main dashboard within 5 seconds on a device meeting the minimum system requirements.";
    private static AiReviewQuotationLocator.Match locate(String quote, String text) {
        return AiReviewQuotationLocator.locate(quote, text, List.of(new PdfInspection.PageText(50, text, false)), new EvidenceLocation(49, null));
    }

    @Test void recoversActualSentenceFromTableLabelsWithoutCallingTheFullQuotationExact() {
        String table = "Performance Requirements\nRequirement ID Requirement Description Validation Method\nNFR-1 Startup Time\n" + SENTENCE + "\nTimed launch test";
        var result = locate("Performance Requirements\nRequirement ID NFR-1\nRequirement Startup Time\nDescription " + SENTENCE, table);
        assertThat(result.located()).isTrue();
        assertThat(result.continuous()).isFalse();
        assertThat(result.approximate()).isTrue();
        assertThat(result.excerpts()).hasSize(1);
        assertThat(result.excerpts().getFirst().text()).isEqualTo(SENTENCE.substring(0, SENTENCE.length() - 1));
        assertThat(result.excerpts().getFirst().location().page()).isEqualTo(50);
    }

    @Test void toleratesASmallOcrTypoButAlwaysDisplaysTheActualSource() {
        var result = locate(SENTENCE.replace("meeting", "meetlng"), SENTENCE);
        assertThat(result.approximate()).isTrue();
        assertThat(result.excerpts().getFirst().text()).contains("meeting").doesNotContain("meetlng");
    }

    @Test void changedNumbersUnitsOperatorsAndNegationsCannotBeRecoveredAsCloseEvidence() {
        for (String changed : List.of(SENTENCE.replace("5 seconds", "10 seconds"), SENTENCE.replace("5 seconds", "5 minutes"),
                SENTENCE.replace("shall launch", "shall not launch"), SENTENCE.replace("within 5", "within < 5")))
            assertThat(locate(changed, SENTENCE).located()).as(changed).isFalse();
        assertThat(locate(SENTENCE, SENTENCE.replace("shall launch", "shall not launch")).located()).isFalse();
        assertThat(locate(SENTENCE, "The system has a dashboard that provides the application functionality for all registered users and project requirements.").located()).isFalse();
    }

    @Test void twoEquallyPlausibleDifferentPassagesStayUnmatched() {
        String a = SENTENCE.replace("meeting", "meetlng");
        String b = SENTENCE.replace("meeting", "meetinq");
        var result = AiReviewQuotationLocator.locate(SENTENCE, "", List.of(new PdfInspection.PageText(1, a, false),
            new PdfInspection.PageText(2, b, false)), null);
        assertThat(result.located()).isFalse();
    }

    @Test void recoversAClosePassageAcrossTheCitedPageAndItsNeighbourWithBothPageNumbers() {
        var pages = List.of(new PdfInspection.PageText(14, "Cover and unrelated project details.", false),
            new PdfInspection.PageText(15, "The application shall launch and display the main dashboard within", false),
            new PdfInspection.PageText(16, "5 seconds on a device meeting the minimum system requirements.", false));
        for (int cited : List.of(15, 16)) {
            var result = AiReviewQuotationLocator.locate(SENTENCE.replace("meeting", "meetlng"), "", pages, new EvidenceLocation(cited, null));
            assertThat(result.approximate()).as("cited page %s", cited).isTrue();
            assertThat(result.continuous()).isFalse();
            assertThat(result.excerpts()).extracting(e -> e.location().page()).containsExactly(15, 16);
            assertThat(result.excerpts().getLast().text()).contains("meeting").doesNotContain("meetlng");
        }
    }

    @Test void closeCrossPageSearchPreservesNegationsNumbersUnitsAndBodyText() {
        String head = "The application shall launch and display the main dashboard within";
        String tail = "5 seconds on a device meeting the minimum system requirements.";
        String quote = SENTENCE.replace("meeting", "meetlng");
        for (String changed : List.of("not " + tail, tail.replace("5", "10"), tail.replace("seconds", "minutes"),
                "except when unauthorized staff access it, " + tail)) {
            var result = AiReviewQuotationLocator.locate(quote, "", List.of(new PdfInspection.PageText(15, head, false),
                new PdfInspection.PageText(16, changed, false)), new EvidenceLocation(15, null));
            assertThat(result.located()).as(changed).isFalse();
        }
        var nonAdjacent = List.of(new PdfInspection.PageText(15, head, false), new PdfInspection.PageText(17, tail, false));
        assertThat(AiReviewQuotationLocator.locate(quote, "", nonAdjacent, new EvidenceLocation(15, null)).located()).isFalse();
    }

    @Test void approximateWindowsCannotJoinDistantPagesOutsideTheCitationNeighbourhood() {
        var pages = List.of(new PdfInspection.PageText(1, "An unrelated cited introduction.", false),
            new PdfInspection.PageText(15, "The application shall launch and display the main dashboard within", false),
            new PdfInspection.PageText(16, "5 seconds on a device meeting the minimum system requirements.", false));
        assertThat(AiReviewQuotationLocator.locate(SENTENCE.replace("meeting", "meetlng"), "", pages,
            new EvidenceLocation(1, null)).located()).isFalse();
    }

    @Test void visualReferenceSurvivesGroundingAndStorageWithoutPretendingToBeAQuote() throws Exception {
        var visual = new VisualObservation("A diagram shows the frontend, API and database layers.", new EvidenceLocation(9, null), false);
        var row = new CriterionAssessment("T1", "Include an architectural block diagram.", FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.ASSESSED, List.of(), List.of(), List.of(), List.of(), CriterionAssessmentLabel.APPEARS_ADDRESSED,
            "The architecture is illustrated.", "", null, "Architecture", List.of(), new EvidenceVerification(null, "", null, visual));
        var raw = new Result("Review", List.of(), List.of(), List.of(), "Inspect the PDF", List.of(), List.of(),
            ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS, new ReviewCoverage(List.of(row), 0, 1, null, ""));
        var inspection = new PdfInspection(true, false, 12, 1, 10, "Architecture", null, List.of());
        var result = AiReviewInstructionEvidencePolicy.locate(AiReviewInstructionProtocol.normalizeEvidenceFormatting(raw, "Architecture"), inspection);
        var json = new com.fasterxml.jackson.databind.ObjectMapper();
        var saved = json.readValue(json.writeValueAsString(AiReviewInstructionsWorkflow.combine(List.of(result))), Result.class);
        var reference = saved.coverage().criteria().getFirst().evidenceVerification();
        assertThat(reference.status()).isEqualTo(QuotationStatus.VISUAL_REFERENCE);
        assertThat(reference.visualObservation().pageValid()).isTrue();
        assertThat(reference.visualObservation().description()).isEqualTo(visual.description());
        assertThat(saved.coverage().criteria().getFirst().assessment()).isEqualTo(CriterionAssessmentLabel.APPEARS_ADDRESSED);
        assertThat(saved.verifiedChecks()).isEmpty();
    }
}
