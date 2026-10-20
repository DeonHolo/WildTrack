package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewInconclusiveCoverageTest {
    private static final String PURPOSE = "The registration service records applications and sends them to authorized staff for a decision.";
    private static final String RETENTION = "Application records are retained locally until the authorized records officer completes the retention review.";
    private static final String TEMPLATE = """
        1. Introduction
        This document describes the registration requirements.
        3. Functional Requirements
        Module 1: Registration
        1.1 Transaction Name
        Use Case Description
        Use Case Diagram
        Activity Diagram
        Wireframe
        """;
    private static final String FIRST = "1. Introduction\n" + PURPOSE + "\n" + RETENTION + "\n" + """
        3. Functional Requirements
        Module 1: Registration
        1.1 Register
        Use Case Description: A guest submits registration information and receives an application identifier.
        Use Case Diagram
        """;
    private static final String SECOND = "Activity Diagram: Start -> Register -> Save -> End\nWireframe: Email | Register";

    @Test void labelledGraphicalContentDoesNotOverrideSupportedBodyObservations() {
        var report = process(twoChecks(), inspection(FIRST, SECOND, true));
        assertThat(report.verifiedChecks()).hasSize(2);
        assertThat(report.verificationNotes()).isEmpty();
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
        assertThat(report.limitations()).anySatisfy(limit -> assertThat(limit).contains("Graphical content", "do not establish"));
    }

    @Test void labelWithoutGraphicalEvidenceRemainsAnUnresolvedCheck() {
        var report = process(twoChecks(), inspection(FIRST, SECOND, false));
        assertThat(report.verificationNotes()).anySatisfy(note -> assertThat(note.issue()).contains("Use Case Diagram"));
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
    }

    @Test void explicitPlaceholderIsNotHiddenByNearbyImagery() {
        var report = process(twoChecks(), inspection(FIRST + "TODO: Insert the diagram here.\n", SECOND, true));
        assertThat(report.outcome()).isNotEqualTo(AiReviewProvider.ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
    }

    @Test void providerReportedConcernRemainsUnresolvedDespiteNearbyImagery() {
        var concern = new AiReviewProvider.Finding("Verify whether the registration paths in this diagram cover administrator rejection.",
            AiReviewProvider.FindingSource.DOCUMENT, PURPOSE, "");
        var raw = new AiReviewProvider.Result("Review", List.of(), List.of(), List.of(), "Inspect", twoChecks(),
            List.of(concern), null);
        var report = AiReviewService.postprocessForBenchmark(raw, "Refactored SRS", "", TEMPLATE,
            inspection(FIRST, SECOND, true));
        assertThat(report.verificationNotes()).isNotEmpty();
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
    }

    @Test void overlappingSubquotationsDoNotBecomeTwoIndependentChecks() {
        String text = PURPOSE + "\n" + RETENTION;
        var report = AiReviewService.postprocessForBenchmark(raw(List.of(check("Registration process", PURPOSE),
            check("Staff decision", "records applications and sends them to authorized staff for a decision."))),
            "SPMP", "", "", text);
        assertThat(report.verifiedChecks()).hasSize(1);
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
    }

    @Test void distinctBodyPassagesKeepTheirSeparateObservations() {
        var report = AiReviewService.postprocessForBenchmark(raw(twoChecks()), "SPMP", "", "", PURPOSE + "\n" + RETENTION);
        assertThat(report.verifiedChecks()).hasSize(2);
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
    }

    @Test void repeatedCoverTextDoesNotMakeOverlappingBodyEvidenceIndependent() {
        String repeated = "sends them to authorized staff for a decision.";
        String text = repeated + "\nTable of Contents\n1. Introduction ........ 2\n2. Records ........ 3\n"
            + "1. Introduction\n" + PURPOSE + "\n2. Records\n" + RETENTION;
        var report = AiReviewService.postprocessForBenchmark(raw(List.of(check("Registration process", PURPOSE),
            check("Staff decision", repeated))), "SPMP", "", "", text);
        assertThat(report.verifiedChecks()).hasSize(1);
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
    }

    @Test void coverOnlyEvidenceDoesNotCountAsBodyReviewCoverage() {
        String cover = "Cedar Registration Management System prepared for the annual academic project review.";
        String text = cover + "\nTable of Contents\n1. Introduction ........ 2\n2. Records ........ 3\n"
            + "1. Introduction\n" + PURPOSE + "\n2. Records\n" + RETENTION;
        var report = AiReviewService.postprocessForBenchmark(raw(List.of(check("Cover identity", cover))), "SPMP", "", "", text);
        assertThat(report.verifiedChecks()).isEmpty();
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
    }

    @Test void invalidQuotationsAreStillExcluded() {
        var report = AiReviewService.postprocessForBenchmark(raw(List.of(check("All applications", "The service accepts every application without further review."))),
            "SPMP", "", "", PURPOSE);
        assertThat(report.verifiedChecks()).isEmpty();
    }

    @Test void coverOnlyEvidenceIsExcludedWithoutATableOfContents() {
        String cover = "Cedar Registration Management System prepared for the annual academic project review.";
        String text = cover + "\n1. Introduction\n" + PURPOSE + "\n2. Records\n" + RETENTION;
        var report = AiReviewService.postprocessForBenchmark(raw(List.of(check("Cover identity", cover))), "SPMP", "", "", text);
        assertThat(report.verifiedChecks()).isEmpty();
    }

    private static List<AiReviewProvider.VerifiedCheck> twoChecks() {
        return List.of(check("Registration purpose", PURPOSE), check("Record retention rule", RETENTION));
    }
    private static AiReviewProvider.VerifiedCheck check(String aspect, String quote) {
        return new AiReviewProvider.VerifiedCheck(aspect, AiReviewProvider.FindingSource.DOCUMENT, quote, "");
    }
    private static AiReviewProvider.Result raw(List<AiReviewProvider.VerifiedCheck> checks) {
        return new AiReviewProvider.Result("Review", List.of(), List.of(), List.of(), "Inspect", checks);
    }
    private static PdfInspection inspection(String first, String second, boolean visual) {
        String text = first + second;
        return new PdfInspection(true, false, 2, 2, text.length(), text, "",
            List.of(new PdfInspection.PageText(1, first, false, visual
                ? List.of(new PdfInspection.IllustratedArtifact("use case diagram", 2)) : List.of()),
                new PdfInspection.PageText(2, second, visual)));
    }
    private static AiReviewProvider.Result process(List<AiReviewProvider.VerifiedCheck> checks, PdfInspection inspection) {
        return AiReviewService.postprocessForBenchmark(raw(checks), "Refactored SRS", "", TEMPLATE, inspection);
    }
}
