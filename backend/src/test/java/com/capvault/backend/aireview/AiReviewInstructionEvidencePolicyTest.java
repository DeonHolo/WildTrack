package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import com.capvault.backend.filecheck.PdfInspection;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class AiReviewInstructionEvidencePolicyTest {
    private static final String BODY = "Students cannot delete accepted records. The timeout is 60 seconds.";

    @Test void missingQuotationDoesNotReplaceTheModelJudgmentOrExplanation() {
        var result = locate(CriterionAssessmentLabel.APPEARS_ADDRESSED, "", "The diagram shows the approval flow.");
        var row = result.coverage().criteria().getFirst();
        assertThat(row.assessment()).isEqualTo(CriterionAssessmentLabel.APPEARS_ADDRESSED);
        assertThat(row.explanation()).isEqualTo("The diagram shows the approval flow.");
        assertThat(row.evidenceVerification().status()).isEqualTo(QuotationStatus.NOT_PROVIDED);
        assertThat(row.documentEvidence()).isNull();
        assertThat(result.verifiedChecks()).isEmpty();
        assertThat(result.outcome()).isEqualTo(ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
    }

    @Test void changedMeaningIsNeverRenderedAsAMatchedPdfQuotation() {
        for (String quote : List.of("Students can delete accepted records.", "The timeout is 600 seconds.", "Students may remove accepted records.")) {
            var result = locate(CriterionAssessmentLabel.APPEARS_ADDRESSED, quote, "The model judged the instruction addressed.");
            var row = result.coverage().criteria().getFirst();
            assertThat(row.assessment()).isEqualTo(CriterionAssessmentLabel.APPEARS_ADDRESSED);
            assertThat(row.evidenceVerification().status()).isEqualTo(QuotationStatus.NOT_LOCATED);
            assertThat(row.evidenceVerification().providerQuotation()).isEqualTo(quote);
            assertThat(row.documentEvidence()).isNull();
            assertThat(row.documentExcerpts()).isEmpty();
            assertThat(result.findings()).isEmpty();
        }
    }

    @Test void aLocatedQuoteDoesNotTurnAManualQuestionIntoAPass() {
        var result = locate(CriterionAssessmentLabel.CHECK_MANUALLY, "The timeout is 60 seconds.",
            "A timeout is stated, but the recovery action is unclear. Check what happens to the saved work.");
        var row = result.coverage().criteria().getFirst();
        assertThat(row.assessment()).isEqualTo(CriterionAssessmentLabel.CHECK_MANUALLY);
        assertThat(row.evidenceVerification().status()).isEqualTo(QuotationStatus.LOCATED);
        assertThat(row.location().page()).isEqualTo(4);
        assertThat(row.documentEvidence()).isEqualTo("The timeout is 60 seconds.");
        assertThat(result.verificationNotes().getFirst().issue()).isEqualTo(row.explanation());
        assertThat(result.outcome()).isEqualTo(ReviewOutcome.INCONCLUSIVE);
    }

    @Test void anUnlocatedQuoteDoesNotHideAModelConcern() {
        var result = locate(CriterionAssessmentLabel.NEEDS_ATTENTION, "A missing quotation.", "The two timeout values conflict.");
        var row = result.coverage().criteria().getFirst();
        assertThat(row.assessment()).isEqualTo(CriterionAssessmentLabel.NEEDS_ATTENTION);
        assertThat(row.explanation()).isEqualTo("The two timeout values conflict.");
        assertThat(result.findings().getFirst().issue()).isEqualTo(row.explanation());
        assertThat(result.findings().getFirst().evidence()).isEmpty();
        assertThat(result.outcome()).isEqualTo(ReviewOutcome.ISSUES_IDENTIFIED);
    }

    @Test void verificationMetadataSurvivesPassCombinationAndJsonStorage() throws Exception {
        var result = AiReviewInstructionsWorkflow.combine(List.of(locate(CriterionAssessmentLabel.APPEARS_ADDRESSED,
            "Students cannot delete accepted records.", "The permissions are described.")));
        var json = new ObjectMapper();
        var saved = json.readValue(json.writeValueAsString(result), Result.class);
        var row = saved.coverage().criteria().getFirst();
        assertThat(row.assessment()).isEqualTo(CriterionAssessmentLabel.APPEARS_ADDRESSED);
        assertThat(row.evidenceVerification().status()).isEqualTo(QuotationStatus.LOCATED);
        assertThat(row.location().page()).isEqualTo(4);
        assertThat(row.documentEvidence()).isEqualTo("Students cannot delete accepted records.");
    }

    @Test void aWrongDocumentOverviewSurvivesPassCombinationEvenWithoutAGeneralFinding() {
        var result = locate(CriterionAssessmentLabel.APPEARS_ADDRESSED, "", "The PDF names a participant.");
        var withOverview = new Result(result.summary(), result.findings(), result.missingRequiredSections(),
            result.limitations(), result.suggestedAction(), result.verifiedChecks(), result.verificationNotes(),
            result.outcome(), result.coverage(), new DocumentOverview("A participant survey was submitted.", "a survey", true, ""));
        assertThat(AiReviewInstructionsWorkflow.combine(List.of(withOverview)).outcome()).isEqualTo(ReviewOutcome.ISSUES_IDENTIFIED);
    }

    private static Result locate(CriterionAssessmentLabel label, String quotation, String explanation) {
        var row = new CriterionAssessment("T1", "Describe permissions and recovery.", FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.NOT_CHECKED, List.of(), List.of(), List.of(), List.of(), label, explanation, quotation,
            new EvidenceLocation(4, "Requirements"), "Permissions and recovery");
        var raw = new Result("AI assessment", List.of(), List.of(), List.of(), "Inspect the PDF", List.of(), List.of(),
            ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS, new ReviewCoverage(List.of(row), 0, 1, null, "Fixed instructions"));
        var inspection = new PdfInspection(true, false, 4, 1, BODY.length(), BODY, "",
            List.of(new PdfInspection.PageText(4, BODY, false)));
        return AiReviewInstructionEvidencePolicy.locate(raw, inspection);
    }
}
