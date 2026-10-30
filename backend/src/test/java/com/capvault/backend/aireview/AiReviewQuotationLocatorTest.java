package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.capvault.backend.filecheck.PdfInspection;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewQuotationLocatorTest {
    @Test void layoutRepairRetainsOriginalPageTextAndIgnoresIncorrectPageHints() {
        var source = "The ﬁnal report requires an archi-\r\ntecture description and a fi\u00adnal scope.";
        var quote = "The final report requires an architecture description and a final scope.";
        var result = AiReviewQuotationLocator.locate(quote, "different bulk layout", List.of(
            page(1, "Unrelated cover page."), page(7, source)), new EvidenceLocation(1, null));
        assertThat(result.continuous()).isTrue();
        assertThat(result.excerpts().getFirst().text()).isEqualTo(source);
        assertThat(result.excerpts().getFirst().location().page()).isEqualTo(7);
    }

    @Test void changedWordsValuesAndOperatorsCannotBeAcceptedAsSimilar() {
        var pairs = List.of(
            List.of("Staff may not accept unassigned teams.", "Staff may accept unassigned teams."),
            List.of("The uptime target is 99.5 percent.", "The uptime target is 99,5 percent."),
            List.of("The response takes < 5 seconds.", "The response takes > 5 seconds."),
            List.of("Access is permitted nowhere in the system.", "Access is permitted now here in the system."),
            List.of("Staff must re-sign the approval form.", "Staff must resign the approval form."),
            List.of("The target is 99% availability for users.", "The target is 99 availability for users."),
            List.of("The temperature must be -5 degrees.", "The temperature must be 5 degrees."));
        for (var pair : pairs) {
            assertThat(AiReviewQuotationLocator.continuous(pair.get(1), pair.get(0))).as(pair.toString()).isFalse();
            assertThat(AiReviewQuotationLocator.locate(pair.get(1), pair.get(0), List.of(page(1, pair.get(0))), null).located()).isFalse();
        }
    }

    @Test void compoundWordsArrowsAndEscapedLayoutRemainReadable() {
        assertThat(AiReviewQuotationLocator.continuous("Staff review owner-visible changes after each release.",
            "Staff review owner-\nvisible changes after each release.")).isTrue();
        assertThat(AiReviewQuotationLocator.continuous("Confirm issue -> implement change -> inspect results.",
            "Confirm issue → implement change → inspect results.")).isTrue();
        assertThat(AiReviewQuotationLocator.continuous("The final\\nreport describes project scope.",
            "The final report describes project scope.")).isTrue();
    }

    @Test void explicitOmissionsAndWholeHeadingsAreSeparateExcerptsNeverContinuous() {
        String source = "• Internet Dependency – Requires an active connection.\r\n• Budget Constraints – Uses existing equipment.\r\n";
        var match = AiReviewQuotationLocator.locate("Internet Dependency […] Budget Constraints", "", List.of(page(9, source)), null);
        assertThat(match.continuous()).isFalse();
        assertThat(match.excerpts()).extracting(DocumentExcerpt::text).containsExactly("Internet Dependency", "Budget Constraints");
        assertThat(match.excerpts()).allSatisfy(e -> assertThat(e.location().page()).isEqualTo(9));
        String headings = "Task A\nAn activity description.\nTask B\nA different activity description.\n";
        assertThat(AiReviewQuotationLocator.locate("Task A\nTask B", "", List.of(page(4, headings)), null).excerpts()).hasSize(2);
        assertThat(AiReviewQuotationLocator.locate("An activity\ndifferent activity", "", List.of(page(4, headings)), null).located()).isFalse();
    }

    @Test void pageFurnitureRepairPreservesEachOriginalSliceAndDoesNotSkipBodyWords() {
        var pages = List.of(page(1, "Project Header\r\nSoftware Requirements\r\nCover\r\nPage 1 of 3\r\n"),
            page(2, "Project Header\r\nSoftware Requirements\r\nThe system retains submitted\r\nPage 2 of 3\r\n"),
            page(3, "Project Header\r\nSoftware Requirements\r\nPDF copies for authorized users.\r\nPage 3 of 3\r\n"));
        var match = AiReviewQuotationLocator.locate("The system retains submitted PDF copies for authorized users.", "bulk differs", pages, null);
        assertThat(match.continuous()).isFalse();
        assertThat(match.excerpts()).extracting(e -> e.location().page()).containsExactly(2, 3);
        assertThat(match.excerpts()).allSatisfy(e -> assertThat(pages.get(e.location().page() - 1).text()).contains(e.text()));
        var negated = List.of(pages.get(0), pages.get(1), page(3, pages.get(2).text().replace("PDF copies", "no PDF copies")));
        assertThat(AiReviewQuotationLocator.locate("The system retains submitted PDF copies for authorized users.", "", negated, null).located()).isFalse();
    }

    @Test void onlyAnExplicitHistoryInstructionCanUseHistoryFrontMatter() {
        String quote = "Version 3.0 was released on 18 October 2026 with corrected regression results.";
        String document = "Software Test Documentation\nChange History\n" + quote
            + "\nTable of Contents\n1. Introduction ..... 4\n1. Introduction\nThe deployed system supports student submissions and academic review.";
        assertThat(AiReviewQuotationLocator.positive(quote, document, "Change history")).isTrue();
        assertThat(AiReviewQuotationLocator.positive(quote, document, "Regression testing")).isFalse();
        assertThat(AiReviewQuotationLocator.positive("Software Test Documentation", document, "Introduction")).isFalse();
    }

    @Test void separatedExcerptsSurviveCombiningAndLegacyJsonStillLoads() throws Exception {
        var excerpt = new DocumentExcerpt("The source text.", new EvidenceLocation(3, null));
        var row = new CriterionAssessment("T1", "Describe the users.", FindingSource.OFFICIAL_TEMPLATE, CoverageStatus.NOT_CHECKED,
            List.of(), List.of(), List.of(), List.of(), CriterionAssessmentLabel.UNVERIFIED,
            "Separate supporting text was located.", null, null, "Users", List.of(excerpt));
        var result = new Result("Limited", List.of(), List.of(), List.of(), "Review", List.of(), List.of(), ReviewOutcome.INCONCLUSIVE,
            new ReviewCoverage(List.of(row), 0, 1, null, "Scope"));
        assertThat(AiReviewInstructionsWorkflow.combine(List.of(result)).coverage().criteria().getFirst().documentExcerpts()).containsExactly(excerpt);
        assertThat(AiReviewCoveragePolicy.combine(result, result).coverage().criteria().getFirst().documentExcerpts()).containsExactly(excerpt);
        var json = new ObjectMapper();
        var old = json.valueToTree(row); ((com.fasterxml.jackson.databind.node.ObjectNode) old).remove("documentExcerpts");
        assertThat(json.treeToValue(old, CriterionAssessment.class).documentExcerpts()).isEmpty();
    }

    @Test void locatedFragmentsDoNotBecomeAnInstructionPassOrManualConcern() {
        String requirement = "Describe the constraints and how they affect the project.";
        String quote = "Internet dependency […] Resource limits";
        String source = "1. Constraints\nInternet dependency - Requires a network connection.\nResource limits - Uses existing equipment.\n";
        var row = new CriterionAssessment("T1", requirement, FindingSource.OFFICIAL_TEMPLATE, CoverageStatus.EVIDENCE_RECORDED,
            List.of(0), List.of(), List.of(), List.of(), CriterionAssessmentLabel.APPEARS_ADDRESSED,
            "The constraints are described.", quote, new EvidenceLocation(2, null), "Constraints");
        var raw = new Result("Review", List.of(), List.of(), List.of(), "Read", List.of(new VerifiedCheck("Constraints", FindingSource.OFFICIAL_TEMPLATE, quote, requirement)),
            List.of(), null, new ReviewCoverage(List.of(row), 0, 1, null, "Scope"));
        var accepted = new Result("Review", List.of(), List.of(), List.of(), "Read", List.of(), List.of(), null);
        var plan = new AiReviewCoveragePolicy.Plan(List.of(new AiReviewCoveragePolicy.Criterion("T1", requirement, FindingSource.OFFICIAL_TEMPLATE, "Constraints")), 0, "Scope");
        var grounded = AiReviewCoveragePolicy.grounded(raw, accepted, plan, source, List.of(page(2, source))).criteria().getFirst();
        assertThat(grounded.assessment()).isEqualTo(CriterionAssessmentLabel.UNVERIFIED);
        assertThat(grounded.documentEvidence()).isNull();
        assertThat(grounded.documentExcerpts()).hasSize(2);
        assertThat(grounded.verifiedCheckIndexes()).isEmpty();
    }

    private static PdfInspection.PageText page(int n, String text) { return new PdfInspection.PageText(n, text, false); }
}
