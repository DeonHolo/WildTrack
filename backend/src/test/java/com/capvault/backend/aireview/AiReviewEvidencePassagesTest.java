package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class AiReviewEvidencePassagesTest {
    @Test void excerptsRemainExactBoundedDistinctAndSpreadThroughTheSource() {
        var lines = new ArrayList<String>();
        for (int i = 0; i < 30; i++) lines.add("Passage " + i
            + " records a distinct submission scenario and its observed response for instructor review.");
        String document = String.join("\n", lines);

        var passages = AiReviewGroundingPolicy.positiveEvidencePassages(document);

        assertThat(passages).hasSize(6).doesNotHaveDuplicates();
        assertThat(passages.getFirst()).isEqualTo(lines.getFirst());
        assertThat(passages.getLast()).isEqualTo(lines.getLast());
        assertThat(passages).allSatisfy(passage -> {
            assertThat(passage.length()).isLessThanOrEqualTo(320);
            assertThat(document).contains(passage);
        });
        var checks = passages.subList(0, 5).stream().map(passage -> new AiReviewProvider.VerifiedCheck(
            "A recorded submission scenario is described", AiReviewProvider.FindingSource.DOCUMENT, passage, "")).toList();
        var report = AiReviewService.postprocessForBenchmark(new AiReviewProvider.Result("Observations", List.of(),
            List.of(), List.of(), "Review", checks), "STD", "", "", document);
        assertThat(report.verifiedChecks()).containsExactlyElementsOf(checks);
    }

    @Test void coverTocAndPlaceholderTextAreNotPositiveEvidenceReferences() {
        String body = "The test plan identifies submitted PDF checks and the required test execution environment.";
        String document = "This cover identifies the submitted project and its academic year for the course roster.\n"
            + "Table of Contents\n1. Test Plan ........ 2\n2. Test Design ........ 3\n1. Test Plan\n" + body
            + "\nTODO: Add a detailed explanation of all submission checks before the next academic review.\n2. Test Design\n";

        assertThat(AiReviewGroundingPolicy.positiveEvidencePassages(document)).containsExactly(body);
    }

    @Test void uncertainBodyBoundaryAndSparseTextSupplyNoPositiveReferences() {
        assertThat(AiReviewGroundingPolicy.positiveEvidencePassages("Table of Contents\n1. Scope\n2. Design")).isEmpty();
        assertThat(AiReviewGroundingPolicy.positiveEvidencePassages("Very sparse document.")).isEmpty();
    }

    @Test void longLinesAreClippedAtAnExistingWordBoundaryWithoutInventingText() {
        String line = "The submission retains original evidence for review. " + "Recorded source passage words. ".repeat(25);
        var passages = AiReviewGroundingPolicy.positiveEvidencePassages(line + "\n" + line.toUpperCase());
        assertThat(passages).hasSize(1);
        assertThat(passages.getFirst().length()).isLessThanOrEqualTo(320);
        assertThat(line).startsWith(passages.getFirst() + " ");
    }
}
