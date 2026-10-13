package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class AiReviewBodySectionCheckTest {
    private static final String PLAN = "The test plan identifies the test scope and the planned execution environment.";
    private static final String DESIGN = "The test design maps submission scenarios to expected application responses.";
    private static final String RESULTS = "The recorded results identify observed outcomes and unresolved defects.";
    private static final String DOCUMENT = "1. Test Plan\n" + PLAN + "\n2. Test Design\n" + DESIGN
        + "\n3. Test Results\n" + RESULTS;

    @Test void namedBodySectionBeforeDescriptiveProseRetainsItsOwnVerifiedEvidence() {
        var checks = List.of(check("Test Plan body section describes scope and environment", PLAN),
            check("The Test Design body section describes submission scenarios", DESIGN),
            check("Test Results body subsection documents observed outcomes", RESULTS));

        var report = process(checks, DOCUMENT);

        assertThat(report.verifiedChecks()).containsExactlyElementsOf(checks);
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
    }

    @Test void namedSectionCannotBorrowAnExactQuoteFromAnotherSection() {
        assertThat(process(List.of(check("Test Plan body section", RESULTS)), DOCUMENT).verifiedChecks()).isEmpty();
    }

    @Test void tocOnlySubsectionCannotBorrowEvidenceFromTheOverviewBody() {
        String tocOnly = "Table of Contents\n1. Test Plan ........ 2\n2. Test Design ........ 3\n"
            + "1. Overview\n" + PLAN;

        var report = process(List.of(check("Test Plan body subsection", PLAN)), tocOnly);

        assertThat(report.verifiedChecks()).isEmpty();
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
    }

    private static AiReviewProvider.VerifiedCheck check(String aspect, String evidence) {
        return new AiReviewProvider.VerifiedCheck(aspect, AiReviewProvider.FindingSource.DOCUMENT, evidence, "");
    }

    private static AiReviewProvider.Result process(List<AiReviewProvider.VerifiedCheck> checks, String document) {
        var raw = new AiReviewProvider.Result("Provider observations", List.of(), List.of(), List.of(), "Review", checks);
        return AiReviewService.postprocessForBenchmark(raw, "Software Test Document", "", "", document);
    }
}
