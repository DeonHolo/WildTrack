package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewDocumentOverviewTest {
    private static final String QUOTE = "Participant feedback questionnaire for the community booking service.";
    private static final String TEXT = "This questionnaire collects participant feedback. It contains rating questions and space for comments.";
    private static final AiReviewProvider.DocumentOverview OVERVIEW = new AiReviewProvider.DocumentOverview(
        TEXT, "a survey questionnaire", true, QUOTE);
    private AiReviewProvider.DocumentOverview ground(AiReviewProvider.DocumentOverview overview,
            List<AiReviewProvider.Finding> findings) {
        return AiReviewService.groundDocumentOverview(overview, QUOTE, findings);
    }
    private AiReviewProvider.Finding mismatch() {
        return new AiReviewProvider.Finding("This is not the requested document: the PDF is a questionnaire, not a management plan.",
            AiReviewProvider.FindingSource.DOCUMENT, QUOTE, "");
    }

    @Test void retainsNeutralDescriptionsWithoutCallingTheDocumentWrong() {
        var overview = new AiReviewProvider.DocumentOverview(TEXT, "a survey questionnaire", false, QUOTE);
        assertThat(ground(overview, List.of())).isEqualTo(overview);
    }

    @Test void warnsOnlyWhenAnExplicitSourceSupportedMismatchFindingSurvives() {
        assertThat(ground(OVERVIEW, List.of(mismatch())).wrongDocument()).isTrue();
        assertThat(ground(OVERVIEW, List.of()).wrongDocument()).isFalse();
    }

    @Test void missingTermsOrWeakSectionsDoNotBecomeAnIdentityWarning() {
        var glossary = new AiReviewProvider.Finding("A glossary term is not defined.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, QUOTE, "Define required terms.");
        var content = new AiReviewProvider.Finding("The PDF does not explain its risk response.",
            AiReviewProvider.FindingSource.DOCUMENT, QUOTE, "");
        assertThat(ground(OVERVIEW, List.of(glossary, content)).wrongDocument()).isFalse();
    }

    @Test void anUnrelatedMismatchQuotationCannotAuthorizeTheWarning() {
        var other = new AiReviewProvider.Finding(mismatch().issue(), AiReviewProvider.FindingSource.DOCUMENT,
            "A different passage from the PDF.", "");
        assertThat(ground(OVERVIEW, List.of(other)).wrongDocument()).isFalse();
    }

    @Test void independentlyGroundedDifferentIdentityQuotationsCanSupportAMismatch() {
        String document = QUOTE + "\nStudents answer the stakeholder questionnaire using the rating scale.";
        var finding = new AiReviewProvider.Finding("The student submitted a questionnaire instead of the required project management plan.",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
            "Students answer the stakeholder questionnaire using the rating scale.", "Submit the project management plan.");
        assertThat(AiReviewService.groundDocumentOverview(OVERVIEW, document, List.of(finding)).wrongDocument()).isTrue();
    }

    @Test void supportedMismatchTextDoesNotDiscardTheWholeOverview() {
        var overview = new AiReviewProvider.DocumentOverview("This is not the required document; it is a survey questionnaire.",
            "a survey questionnaire", true, QUOTE);
        assertThat(ground(overview, List.of(mismatch())).wrongDocument()).isTrue();
    }

    @Test void equivalentIdentityMismatchPhrasingDoesNotDependOnOneExactPhrase() {
        for (String phrase : List.of("instead of the requested", "rather than the required", "not the expected")) {
            var finding = new AiReviewProvider.Finding("The PDF is a questionnaire " + phrase + " management plan.",
                AiReviewProvider.FindingSource.DOCUMENT, QUOTE, "");
            assertThat(ground(OVERVIEW, List.of(finding)).wrongDocument()).as(phrase).isTrue();
        }
    }

    @Test void aStitchedIdentityQuoteUsesOnlyItsAlreadyGroundedPassage() {
        var overview = new AiReviewProvider.DocumentOverview("This is a questionnaire rather than the required plan for ExampleProject.",
            "a survey questionnaire", true, QUOTE + " Rating questions:");
        var grounded = ground(overview, List.of(mismatch()));
        assertThat(grounded.wrongDocument()).isTrue();
        assertThat(grounded.evidence()).isEqualTo(QUOTE);
        assertThat(grounded.text()).isEqualTo("The submitted PDF appears to be a survey questionnaire.");
        assertThat(ground(new AiReviewProvider.DocumentOverview(TEXT, "a questionnaire", true,
            "A completely fabricated quotation."), List.of(mismatch()))).isNull();
    }

    @Test void dropsUncitedOrOversizedOverviewsWithoutDiscardingTheReview() {
        assertThat(AiReviewService.groundDocumentOverview(OVERVIEW, "A different document body.", List.of(mismatch()))).isNull();
        assertThat(ground(new AiReviewProvider.DocumentOverview("word ".repeat(91), "a questionnaire", false, QUOTE), List.of())).isNull();
        assertThat(ground(new AiReviewProvider.DocumentOverview(TEXT, "a questionnaire", false, ""), List.of())).isNull();
    }

    @Test void doesNotAllowTheMismatchSentenceInsideTheNeutralDescription() {
        var overview = new AiReviewProvider.DocumentOverview("This is not the required document.", "a questionnaire", false, QUOTE);
        assertThat(ground(overview, List.of())).isNull();
    }

    @Test void aDescriptionCanExplainPurposeWithoutTreatingOrdinaryContrastAsAMismatch() {
        var overview = new AiReviewProvider.DocumentOverview("This document describes digital records rather than paper forms.",
            "a project plan", false, QUOTE);
        assertThat(ground(overview, List.of())).isEqualTo(overview);
    }

    @Test void savedReportsRoundTripAndOlderReportsRemainReadable() throws Exception {
        var json = new ObjectMapper();
        var result = new AiReviewProvider.Result("Review result", List.of(mismatch()), List.of(), List.of(), "Check the document.",
            List.of(), List.of(), AiReviewProvider.ReviewOutcome.ISSUES_IDENTIFIED, null, OVERVIEW);
        assertThat(json.readValue(json.writeValueAsString(result), AiReviewProvider.Result.class)).isEqualTo(result);
        var old = json.readValue("{\"summary\":\"Old result\",\"findings\":[],\"missingRequiredSections\":[],\"limitations\":[],\"suggestedAction\":\"Inspect the PDF.\"}", AiReviewProvider.Result.class);
        assertThat(old.documentOverview()).isNull();
        assertThat(old.verifiedChecks()).isEmpty();
    }

    @Test void addingCoverageDoesNotLoseTheOverview() {
        var result = new AiReviewProvider.Result("Review result", List.of(), List.of(), List.of(), "Inspect the PDF.",
            List.of(), List.of(), null, null, OVERVIEW);
        assertThat(AiReviewCoveragePolicy.withCoverage(result, new AiReviewProvider.ReviewCoverage(List.of(), 0, 1, null, null))
            .documentOverview()).isEqualTo(OVERVIEW);
        assertThat(AiReviewCoveragePolicy.combine(result, result).documentOverview()).isEqualTo(OVERVIEW);
    }
}
