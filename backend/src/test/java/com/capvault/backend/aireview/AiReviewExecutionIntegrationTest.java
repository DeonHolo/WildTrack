package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewExecutionIntegrationTest {
    private static final String EXECUTION = """
        1. Introduction
        This report records the execution of the inventory permission checks on build 17.
        2. Execution Results
        Test case: SEC-42
        Expected outcome: HTTP 201
        Actual outcome: HTTP 401
        Result: PASS
        """;

    @Test void anOtherwiseUsableProviderReplyCannotHideAnExplicitExecutionContradiction() {
        var report = review(EXECUTION, List.of());
        assertThat(report.findings()).singleElement().satisfies(finding -> {
            assertThat(finding.source()).isEqualTo(AiReviewProvider.FindingSource.DOCUMENT);
            assertThat(finding.requirement()).isEmpty();
            assertThat(finding.evidence()).contains("HTTP 201", "HTTP 401", "PASS");
            assertThat(finding.location().page()).isEqualTo(5);
            assertThat(EXECUTION).contains(finding.evidence());
        });
        assertThat(report.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.ISSUES_IDENTIFIED);
        assertThat(report.summary()).doesNotContain("No issues");
    }

    @Test void expectedAccessRejectionIsNotAnExecutionFailure() {
        assertThat(review(EXECUTION.replace("HTTP 201", "HTTP 401"), List.of()).findings()).isEmpty();
        assertThat(review(EXECUTION.replace("Result: PASS", "Result: FAIL"), List.of()).findings()).isEmpty();
    }

    @Test void anAlreadyReportedExactContradictionIsNotRepeated() {
        var found = review(EXECUTION, List.of()).findings().getFirst();
        assertThat(review(EXECUTION, List.of(found)).findings()).hasSize(1);
    }

    @Test void providerQuotationOfTheSameExecutionDoesNotNeedToIncludeItsCaseLabel() {
        var provider = new AiReviewProvider.Finding(
            "The test is marked PASS despite differing expected and actual HTTP statuses.",
            AiReviewProvider.FindingSource.DOCUMENT,
            "Expected outcome: HTTP 201\nActual outcome: HTTP 401\nResult: PASS", "");
        assertThat(review(EXECUTION, List.of(provider)).findings()).hasSize(1);
    }

    @Test void identicalValuesInDifferentExecutionsStillProduceSeparateFindings() {
        var provider = new AiReviewProvider.Finding(
            "SEC-42 is marked PASS despite differing expected and actual HTTP statuses.",
            AiReviewProvider.FindingSource.DOCUMENT,
            "Expected outcome: HTTP 201\nActual outcome: HTTP 401\nResult: PASS", "");
        String twoCases = EXECUTION + "\nTest case: SEC-43\nExpected outcome: HTTP 201\n"
            + "Actual outcome: HTTP 401\nResult: PASS\n";
        assertThat(review(twoCases, List.of(provider)).findings()).hasSize(2);
    }

    private static AiReviewProvider.Result review(String text, List<AiReviewProvider.Finding> findings) {
        var raw = new AiReviewProvider.Result("Review completed.", findings, List.of(), List.of(),
            "Inspect the recorded evidence.", List.of());
        var inspection = new PdfInspection(true, false, 5, 1, text.length(), text, "",
            List.of(new PdfInspection.PageText(5, text, false)));
        return AiReviewService.postprocessForBenchmark(raw, "Submitted report", "", "", inspection);
    }
}
