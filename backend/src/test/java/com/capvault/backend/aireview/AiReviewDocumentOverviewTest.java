package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.capvault.backend.filecheck.PdfInspection;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewDocumentOverviewTest {
    private static final DocumentOverview OVERVIEW = new DocumentOverview(
        "This questionnaire collects participant feedback. It contains ratings and comments.",
        "a survey questionnaire", true, "Participant feedback questionnaire");

    private Result ground(DocumentOverview overview, String document) {
        var raw = new Result("Review result", List.of(), List.of(), List.of(), "Inspect the PDF.",
            List.of(), List.of(), ReviewOutcome.INCONCLUSIVE,
            new ReviewCoverage(List.of(), 0, 1, null, null), overview);
        var input = new Input("overview-fixture", new byte[0], document, "",
            "Software Requirements Specification", "", "");
        var inspection = new PdfInspection(true, false, 1, document.isBlank() ? 0 : 1,
            document.length(), document, null, List.of(new PdfInspection.PageText(1, document, false)));
        return AiReviewService.groundInstructions(raw, input, inspection, List.of());
    }

    @Test void aShortPlaceholderStillHasItsActualDocumentOverview() {
        var overview = new DocumentOverview(
            "The PDF contains only the word Nothing, rather than a requirements specification.",
            "a placeholder document", true, "Nothing");
        assertThat(ground(overview, "Nothing").documentOverview()).isEqualTo(overview);
    }

    @Test void anUnmatchedOrStitchedOverviewQuotationDoesNotRemoveTheDescription() {
        assertThat(ground(OVERVIEW, "An extracted table with a different reading order.").documentOverview())
            .isEqualTo(OVERVIEW);
        var stitched = new DocumentOverview(OVERVIEW.text(), OVERVIEW.actualDocumentType(), true,
            "Participant feedback questionnaire Rating questions");
        assertThat(ground(stitched, "Participant feedback questionnaire\n1. Rating questions").documentOverview())
            .isEqualTo(stitched);
    }

    @Test void imageOnlyOrUnrelatedContentDoesNotSuppressTheOverview() {
        var scanned = new DocumentOverview("The PDF contains scanned pages with no readable text layer.",
            "a scanned document", false, "");
        assertThat(ground(scanned, "").documentOverview()).isEqualTo(scanned);
        var story = new DocumentOverview("This is a fictional story, rather than a requirements specification.",
            "a fictional story", true, "Once upon a time");
        assertThat(ground(story, "Once upon a time").documentOverview()).isEqualTo(story);
    }

    @Test void overviewWordCountAndMissingIdentityFieldsDoNotSilentlyEraseItsText() {
        var longer = new DocumentOverview("word ".repeat(91), "a report", false, "Report");
        assertThat(ground(longer, "Report").documentOverview()).isEqualTo(longer);
        var descriptionOnly = new DocumentOverview("The PDF describes a project plan.", null, false, null);
        assertThat(ground(descriptionOnly, "Project plan").documentOverview()).isEqualTo(descriptionOnly);
    }

    @Test void mismatchDescriptionDoesNotDependOnRetainingASeparateFinding() {
        assertThat(ground(OVERVIEW, "Participant feedback questionnaire").documentOverview())
            .isEqualTo(OVERVIEW);
    }

    @Test void savedReportsRoundTripAndOlderReportsRemainReadable() throws Exception {
        var json = new ObjectMapper();
        var result = ground(OVERVIEW, "Participant feedback questionnaire");
        assertThat(json.readValue(json.writeValueAsString(result), Result.class)).isEqualTo(result);
        var old = json.readValue("{\"summary\":\"Old result\",\"findings\":[],\"missingRequiredSections\":[],\"limitations\":[],\"suggestedAction\":\"Inspect the PDF.\"}", Result.class);
        assertThat(old.documentOverview()).isNull();
        assertThat(old.verifiedChecks()).isEmpty();
    }

    @Test void addingOrCombiningCoveragePreservesTheOverview() {
        var result = ground(OVERVIEW, "Participant feedback questionnaire");
        assertThat(AiReviewCoveragePolicy.withCoverage(result, new ReviewCoverage(List.of(), 0, 1, null, null))
            .documentOverview()).isEqualTo(OVERVIEW);
        assertThat(AiReviewCoveragePolicy.combine(result, result).documentOverview()).isEqualTo(OVERVIEW);
    }
}
