package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

class AiReviewEvidencePassagesTest {
    @Test void longHeadingOrFigureCaptionAloneDoesNotBecomePositiveEvidence() {
        assertThat(AiReviewPositiveEvidencePolicy.select(List.of(
            "Figure CLS-01. Selected implementation classes and their documented responsibility boundaries across service modules and adapters.")))
            .isEmpty();
        assertThat(AiReviewPositiveEvidencePolicy.select(List.of(
            "4.7 Detailed design for identity and academic configuration across institutional administrative workflows")))
            .isEmpty();
    }
    @Test void undottedBodyHeadingResumesCitationSelectionAfterNumberedReferences() {
        String document = "2 References\n1 Vendor Documentation\n"
            + "This publication provides background guidance for the project management plan.\n"
            + "3 Definitions\n"
            + "Controlled Remediation means an action that requires user consent and records the result before continuing.";
        var passages = AiReviewPositiveEvidencePolicy.select(document.lines().toList());
        assertThat(passages).hasSize(1);
        assertThat(passages.getFirst()).contains("3 Definitions", "Controlled Remediation")
            .doesNotContain("Vendor", "publication");
    }
    @Test void wrappedParagraphRetainsTheCompleteMeaningAndExactSourceNewlines() {
        String document = "1. Project purpose\n"
            + "The diagnostic project assists Windows users who cannot inspect their own hardware,\n"
            + "by presenting supported diagnostic observations and requiring confirmation before any\n"
            + "controlled remediation is performed. Its project lead records each approved change.";

        var passages = AiReviewPositiveEvidencePolicy.select(document.lines().toList());

        assertThat(passages).containsExactly(document);
        assertThat(passages.getFirst()).contains("hardware,\nby presenting", "before any\ncontrolled remediation");
    }

    @Test void populatedTableKeepsItsColumnAndWrappedRowContext() {
        String table = "Role | Responsibility | Evidence\n"
            + "Project lead | Reviews proposed scope changes with the team and records the resulting\n"
            + "approval before the baseline changes. | Approved change log\n"
            + "Test coordinator | Records expected and actual results for each submitted scenario. | Test log";
        String document = "4.3 Roles and responsibilities\n" + table;

        assertThat(AiReviewPositiveEvidencePolicy.select(document.lines().toList())).containsExactly(document);
    }

    @Test void passagesAreBoundedNonOverlappingAndSpreadAcrossSectionsAndSourcePositions() {
        var lines = new ArrayList<String>();
        for (int section = 1; section <= 12; section++) {
            lines.add(section + ". Review area " + section);
            for (int paragraph = 1; paragraph <= 4; paragraph++) {
                lines.add("Area " + section + " observation " + paragraph + " records the original submitted source and its observed response.");
                lines.add("The instructor compares that evidence with the documented expected outcome before recording an assessment.");
                lines.add("");
            }
        }
        String document = String.join("\n", lines);

        var passages = AiReviewPositiveEvidencePolicy.select(lines);

        assertThat(passages).hasSizeBetween(12, 20).doesNotHaveDuplicates();
        assertThat(String.join("\n", passages)).contains("Area 1 observation 1", "Area 6 observation", "Area 12 observation 4");
        assertThat(IntStream.rangeClosed(1, 12).filter(section -> passages.stream()
            .anyMatch(passage -> passage.contains("Area " + section + " observation"))).count()).isEqualTo(12);
        assertThat(passages.stream().mapToInt(String::length).sum()).isLessThanOrEqualTo(16_000);
        int previousEnd = -1;
        for (String passage : passages) {
            assertThat(passage.length()).isLessThanOrEqualTo(780);
            int start = document.indexOf(passage);
            assertThat(start).isGreaterThanOrEqualTo(previousEnd);
            previousEnd = start + passage.length();
        }
    }

    @Test void anExcerptNeverJoinsContentFromDifferentSections() {
        String first = "The project lead reviews scope changes with the team and records the approval before changing the baseline.";
        String second = "The test coordinator compares actual results with expected results and keeps the original evidence for review.";

        var passages = AiReviewPositiveEvidencePolicy.select(List.of("1. Scope control", first,
            "2. Test responsibilities", second));

        assertThat(passages).hasSize(2);
        assertThat(passages.getFirst()).contains(first).doesNotContain(second);
        assertThat(passages.getLast()).contains(second).doesNotContain(first);
    }

    @Test void numberedBibliographyRowsStayExcludedUntilTheNextRealSection() {
        String document = "2. References\n"
            + "1 IEEE Standard 1058-1998\nUsed as a general reference for the project management structure.\n"
            + "2 Project Template provided for the course\nUsed as the formatting and section guide for preparing the project plan.\n"
            + "12 Hosting Documentation Used as reference for public deployment and lightweight service endpoints.\n"
            + "3. Definitions\n"
            + "Controlled Remediation means an action that requires user consent and records its result before showing the next recommendation.";

        var passages = AiReviewPositiveEvidencePolicy.select(document.lines().toList());

        assertThat(passages).hasSize(1);
        assertThat(passages.getFirst()).startsWith("3. Definitions\n").doesNotContain("Template", "Hosting", "IEEE");
    }

    @Test void requirementIdentifiersKeepTheirNearbyPopulatedTableContext() {
        String document = "4.2 Requirements inventory\n"
            + "Requirement | Design | Verification\n"
            + "REQ-1\n"
            + "The system shall show the detected hardware profile and distinguish unavailable information from confirmed observations.\n"
            + "Profile interface | Compare the saved profile with the original device record.\n"
            + "REQ-2\n"
            + "The system shall preserve the previous diagnostic result when a new request cannot be completed.";

        var passages = AiReviewPositiveEvidencePolicy.select(document.lines().toList());

        assertThat(passages).containsExactly(document);
    }

    @Test void overflowKeepsAnAlreadyStartedWrappedSentenceWithItsContinuation() {
        String first = "The project lead records source evidence and evaluates each requested change "
            + "with the responsible developer before approving a baseline update. ";
        String complete = first.repeat(4).strip();
        String wrapped = "The test coordinator records the expected outcome and original device evidence "
            + "for each submitted scenario before the instructor compares the result with the requirement";
        String continuation = "and records whether the observed response matches the documented expectation for that scenario.";
        String document = "1. Management procedures\n" + complete + "\n" + wrapped + "\n" + continuation;

        var passages = AiReviewPositiveEvidencePolicy.select(document.lines().toList());

        assertThat(passages).hasSize(2);
        assertThat(passages.getFirst()).endsWith("baseline update.");
        assertThat(passages.getLast()).isEqualTo(wrapped + "\n" + continuation);
    }

    @Test void tocCoverIndexBibliographyAndAuthoringPlaceholdersAreNotPositiveReferences() {
        String body = "The test plan identifies submitted PDF checks and the required test execution environment. "
            + "The instructor retains the resulting evidence for comparison with each expected outcome.";
        String document = "This cover identifies the submitted project and its academic year for the course roster.\n"
            + "Table of Contents\n1. Test Plan ........ 2\n2. References ........ 3\n1. Test Plan\n" + body
            + "\nTODO: Add a detailed explanation of all submission checks before the next academic review.\n"
            + "[Insert the full description of the missing test environment here]\n"
            + "2. References\n1. IEEE Standard 1058-1998\nThis reference supports the project plan structure and its required management records.\n"
            + "3. Index\nSchedule allocation and control 1.1.4, 5.2.2, 5.3.2, Annex A\n"
            + "The index below uses section references instead of page numbers so that it remains usable during editing.";

        var passages = AiReviewGroundingPolicy.positiveEvidencePassages(document);

        assertThat(passages).hasSize(1);
        assertThat(passages.getFirst()).contains(body).doesNotContain("cover", "TODO", "Insert", "IEEE", "index");
    }

    @Test void recurringHeadersAndPageFootersDoNotBecomeCitationsOrJoinSeparatedText() {
        var lines = new ArrayList<String>();
        for (int page = 1; page <= 4; page++) {
            lines.add("SOFTWARE PROJECT MANAGEMENT PLAN | Document Version: 1.0");
            lines.add("The original evidence on page " + page + " records the project decision and the rationale that supports instructor review.");
            lines.add("Page " + page + " of 4");
        }

        var passages = AiReviewPositiveEvidencePolicy.select(lines);

        assertThat(passages).hasSize(4);
        assertThat(passages).allSatisfy(passage -> assertThat(passage)
            .doesNotContain("SOFTWARE PROJECT", "Document Version", " of 4"));
    }

    @Test void uncertainBodyBoundarySparseTextAndMetadataOnlyDocumentsSupplyNoPositiveReferences() {
        assertThat(AiReviewGroundingPolicy.positiveEvidencePassages("Table of Contents\n1. Scope\n2. Design")).isEmpty();
        assertThat(AiReviewGroundingPolicy.positiveEvidencePassages("Very sparse document.")).isEmpty();
        assertThat(AiReviewPositiveEvidencePolicy.select(List.of("4. Schedule", "Week | Hours", "1 2 3 4 5", "Page 1 of 1"))).isEmpty();
        assertThat(AiReviewPositiveEvidencePolicy.select(List.of("REFERENCES", "[1] IEEE Standard 1058-1998",
            "This standard provides a detailed and structured reference for project management planning and control."))).isEmpty();
    }

    @Test void longLinesAreSplitAtExistingWordBoundariesWithoutInventingOrRepeatingText() {
        String line = "The submission retains original evidence for review. " + "Recorded source passage words. ".repeat(80);
        var passages = AiReviewPositiveEvidencePolicy.select(List.of(line, line.toUpperCase()));

        assertThat(passages).hasSizeGreaterThan(1).doesNotHaveDuplicates();
        assertThat(passages).allSatisfy(passage -> {
            assertThat(passage.length()).isLessThanOrEqualTo(780);
            assertThat(line).contains(passage);
            int end = line.indexOf(passage) + passage.length();
            assertThat(end == line.length() || line.charAt(end) == ' ').isTrue();
        });
    }

    @Test void citationPreparationDoesNotGrantAuthorityOrCreateSuccessfulChecks() {
        String document = "1. Review responsibilities\n"
            + "The instructor compares the submitted evidence with the documented expected outcome before recording an assessment.\n"
            + "2. Retention\n"
            + "The project lead retains the source document and the recorded review so later changes can be inspected independently.";
        var passages = AiReviewGroundingPolicy.positiveEvidencePassages(document);
        var checks = passages.stream().map(passage -> new AiReviewProvider.VerifiedCheck(
            "A recorded review procedure is described", AiReviewProvider.FindingSource.DOCUMENT, passage, "")).toList();
        var report = AiReviewService.postprocessForBenchmark(new AiReviewProvider.Result("Observations", List.of(),
            List.of(), List.of(), "Review", checks), "STD", "", "", document);

        assertThat(passages).hasSize(2);
        assertThat(report.verifiedChecks()).containsExactlyElementsOf(checks);
        assertThat(report.findings()).isEmpty();
    }
}
