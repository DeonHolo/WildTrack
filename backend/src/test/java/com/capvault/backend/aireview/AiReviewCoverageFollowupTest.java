package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.*;

import com.capvault.backend.filecheck.PdfInspection;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class AiReviewCoverageFollowupTest {
    private static final String PURPOSE = "The registration service records applications and sends them to authorized staff for a decision. The staff view retains the original request so reviewers can inspect the submitted information.";
    private static final String RETENTION = "Application records are retained locally until the authorized records officer completes the retention review. That officer records the reason for each approved removal before any stored application is deleted.";
    private static final String RECOVERY = "An interrupted upload keeps its saved draft and offers another submission attempt. The student can inspect the preserved draft before deciding whether to submit it again for staff review.";
    private static final String TEXT = "1. Purpose\n" + PURPOSE + "\n2. Retention policy\n" + RETENTION + "\n3. Recovery\n" + RECOVERY;
    private static final PdfInspection PDF = new PdfInspection(true, false, 3, 3, TEXT.length(), TEXT, "",
        List.of(new PdfInspection.PageText(1, "1. Purpose\n" + PURPOSE, false),
            new PdfInspection.PageText(2, "2. Retention policy\n" + RETENTION, false),
            new PdfInspection.PageText(3, "3. Recovery\n" + RECOVERY, false)));

    @Test void successfulSparseFirstPassGetsOnlyOneFocusedAdditionalCall() {
        assertThat(AiReviewCoveragePolicy.unusedPassages(TEXT, List.of(PURPOSE))).hasSizeGreaterThanOrEqualTo(2);
        var provider = new Sequence(raw(PURPOSE), raw(RETENTION));
        var report = run(provider);
        assertThat(provider.inputs).hasSize(2);
        assertThat(provider.inputs.getLast().idempotencyKey()).endsWith(":coverage-2");
        assertThat(provider.inputs.getLast().priorEvidence()).containsExactly(PURPOSE);
        assertThat(provider.inputs.getLast().focusCriterionIds()).contains("C2");
        assertThat(report.verifiedChecks()).hasSize(2);
        assertThat(report.outcome()).isEqualTo(ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
        assertThat(report.coverage().completedPasses()).isEqualTo(2);
    }

    @Test void repeatedSecondPassEvidenceCannotBecomeASecondIndependentObservation() {
        var provider = new Sequence(raw(PURPOSE), raw(PURPOSE));
        var report = run(provider);
        assertThat(provider.inputs).hasSize(2);
        assertThat(report.verifiedChecks()).hasSize(1);
        assertThat(report.outcome()).isEqualTo(ReviewOutcome.INCONCLUSIVE);
        assertThat(report.coverage().followupNotice()).contains("without additional independent evidence");
    }

    @Test void anInitialProviderRejectionIsNeverAutomaticallyRetried() {
        for (String code : List.of("REQUEST_REJECTED", "RATE_LIMITED", "PROVIDER_TIMEOUT", "PROVIDER_OUTCOME_UNKNOWN")) {
            var provider = new Sequence(new GeminiAiReviewProvider.Failure(code), raw(RETENTION));
            assertThatThrownBy(() -> run(provider)).isInstanceOf(GeminiAiReviewProvider.Failure.class);
            assertThat(provider.inputs).hasSize(1);
        }
    }

    @Test void anInvalidFirstResultIsNeverAutomaticallyRetried() {
        var provider = new Sequence(null, raw(RETENTION));
        assertThatThrownBy(() -> run(provider)).isInstanceOf(RuntimeException.class);
        assertThat(provider.inputs).hasSize(1);
    }

    @Test void failedOrInvalidFocusedPassPreservesTheUsefulFirstResult() {
        for (Object failed : new Object[]{new GeminiAiReviewProvider.Failure("REQUEST_REJECTED"), null}) {
            var provider = new Sequence(raw(PURPOSE), failed);
            var report = run(provider);
            assertThat(provider.inputs).hasSize(2);
            assertThat(report.verifiedChecks()).extracting(VerifiedCheck::documentEvidence).containsExactly(PURPOSE);
            assertThat(report.coverage().completedPasses()).isEqualTo(1);
            assertThat(report.coverage().followupNotice()).contains("preserves the first completed pass");
        }
    }

    @Test void twoIndependentFirstPassObservationsNeedNoAdditionalCall() {
        var provider = new Sequence(raw(PURPOSE, RETENTION));
        var report = run(provider);
        assertThat(provider.inputs).hasSize(1);
        assertThat(report.verifiedChecks()).hasSize(2);
    }

    @Test void generatedVerificationNotesAreNotReinterpretedAsProviderQuotesDuringMerge() {
        var initial = raw(PURPOSE);
        var firstWithUnconfirmedNote = new Result("Review", List.of(), List.of(), List.of(), "Inspect",
            initial.verifiedChecks(), List.of(new Finding("Verify the cited recovery observation.",
                FindingSource.DOCUMENT, "This quoted statement is absent from the document.", "")), null);
        var provider = new Sequence(firstWithUnconfirmedNote, raw(RETENTION));
        var report = run(provider);
        assertThat(provider.inputs).hasSize(2);
        assertThat(report.verifiedChecks()).hasSize(2);
        assertThat(report.verificationNotes()).isNotEmpty();
        assertThat(report.outcome()).isEqualTo(ReviewOutcome.INCONCLUSIVE);
        assertThat(report.coverage().completedPasses()).isEqualTo(2);
        assertThat(report.coverage().followupNotice()).contains("additional supported evidence");
    }

    @Test void observationsWithoutAnyRetainedChecklistLinkGetOnlyOneFocusedPass() {
        var first = raw(PURPOSE, RETENTION);
        var plan = AiReviewCoveragePolicy.plan(input(TEXT).instructions(), "");
        first = AiReviewCoveragePolicy.withCoverage(first, AiReviewCoveragePolicy.proposed(plan, List.of()));
        var provider = new Sequence(first, raw(RECOVERY));
        var report = run(provider);
        assertThat(provider.inputs).hasSize(2);
        assertThat(provider.inputs.getLast().focusCriterionIds()).containsExactly("C1", "C2");
        assertThat(report.coverage().completedPasses()).isEqualTo(2);
        assertThat(report.verifiedChecks()).hasSize(3);
    }

    @Test void noUnusedSubstantiveEvidenceMeansNoAdditionalCall() {
        var provider = new Sequence(raw(PURPOSE));
        var shortPdf = new PdfInspection(true, false, 1, 1, PURPOSE.length(), PURPOSE, "");
        AiReviewService.reviewForBenchmark(provider, input(PURPOSE), shortPdf);
        assertThat(provider.inputs).hasSize(1);
    }

    @Test void oneUnusedBodyPassageIsEnoughWhenOneObservationAlreadySurvived() {
        String text = "1. Purpose\n" + PURPOSE + "\n2. Recovery\n" + RECOVERY;
        var sparse = raw(PURPOSE);
        assertThat(AiReviewCoveragePolicy.unusedPassages(text, List.of(PURPOSE))).hasSize(1);
        assertThat(AiReviewCoveragePolicy.canFollowUp(sparse, text)).isTrue();
        assertThat(AiReviewCoveragePolicy.canFollowUp(raw(), text)).isTrue();
        assertThat(AiReviewCoveragePolicy.canFollowUp(raw(), "1. Purpose\n" + PURPOSE)).isFalse();
    }

    private static Result run(Sequence provider) { return AiReviewService.reviewForBenchmark(provider, input(TEXT), PDF); }
    @Test void anInterruptedSuccessfulPassDoesNotStartAnotherRequest() {
        var provider = new Sequence(raw(PURPOSE), raw(RETENTION));
        Thread.currentThread().interrupt();
        try {
            var report = run(provider);
            assertThat(provider.inputs).hasSize(1);
            assertThat(report.verifiedChecks()).hasSize(1);
            assertThat(report.coverage().followupNotice()).contains("time limit");
        } finally {
            Thread.interrupted();
        }
    }


    private static Input input(String text) {
        return new Input("claim", new byte[]{1}, text, AiReviewService.SYSTEM_INSTRUCTION, "SPMP",
            "Describe the registration purpose.\nDescribe the record retention process.", "");
    }
    private static Result raw(String... evidence) {
        return new Result("Review", List.of(), List.of(), List.of(), "Inspect",
            java.util.Arrays.stream(evidence).map(quote -> new VerifiedCheck(
                quote.equals(PURPOSE) ? "Registration service" : "Application records", FindingSource.DOCUMENT, quote, "")).toList());
    }
    private static final class Sequence implements AiReviewProvider {
        final Object[] replies;
        final List<Input> inputs = new ArrayList<>();
        Sequence(Object... replies) { this.replies = replies; }
        public boolean isConfigured() { return true; }
        public String cacheVersion() { return "test"; }
        public Result review(Input input) {
            inputs.add(input);
            if (inputs.size() > replies.length) throw new AssertionError("Unexpected extra provider call");
            Object reply = replies[inputs.size() - 1];
            if (reply instanceof RuntimeException failure) throw failure;
            return (Result) reply;
        }
    }
}
