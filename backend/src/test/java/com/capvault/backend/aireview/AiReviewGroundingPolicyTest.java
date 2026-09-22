package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

class AiReviewGroundingPolicyTest {
    private static final String INSTRUCTIONS = "Include a Scope section and the Functional Requirements section.";
    private static final String TEMPLATE = """
        Table of Contents
        1. Introduction .................................... 2
        1.2. Test Approach ................................ 3
        2. Requirements ................................... 4
        1. Introduction
        1.2. Test Approach
        2. Requirements
        """;

    private static AiReviewProvider.Result review(List<AiReviewProvider.Finding> findings,
            List<AiReviewProvider.MissingRequiredSection> missing, String summary, String action) {
        return new AiReviewProvider.Result(summary, findings, missing, List.of(), action);
    }

    private static AiReviewProvider.MissingRequiredSection missing(String name, String requirement) {
        return new AiReviewProvider.MissingRequiredSection(name,
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, requirement);
    }

    private static AiReviewProvider.Finding doc(String issue) {
        return new AiReviewProvider.Finding(issue, AiReviewProvider.FindingSource.DOCUMENT,
            "Page 2: excerpt from the PDF", "");
    }

    @Test void tocEntryAloneDoesNotProveBodySectionButTheActualBodyDoes() {
        String tocOnly = """
            Table of Contents
            1. Introduction .......................... 2
            1.2. Test Approach ......................... 4
            1.3. Definitions and Acronyms .............. 4
            1. Introduction
            Context from the PDF
            1.3. Definitions and Acronyms
            """;
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(tocOnly, "1.2. Test Approach")).isFalse();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(tocOnly + "\n1.2. Test Approach\nDetailed approach",
            "Test Approach")).isTrue();
    }

    @Test void aRealTableOfContentsIsPresentEvenThoughItsTitleIsExcludedFromChapterBodyDetection() {
        // The template uses dotted leaders, while the submitted 84-page PDF's
        // index uses clean page-number columns and different chapter numbering.
        String officialTemplate = """
            Table of Contents
            Change History ....................................... 2
            Table of Contents .................................... 3
            1. Introduction ...................................... 4
            2. Overall Description .............................. 5
            3. Specific Requirements ............................ 7
            1. Introduction
            1.1 Purpose
            """;
        String submitted = """
            Table of Contents
            Change History                                      2
            Table of Contents                                   3
            1. Introduction                                     4
            1.1 Purpose                                         4
            1.2 Scope                                           4
            2. Overall Description                              7
            2.3 Constraints                                     7
            2.4 Assumptions and Dependencies                    8
            3. External Interface Requirements                 10
            4. Functional Requirements                         10
            4.1 Module 1: Service Record Input                 11
            5. Non-functional Requirements                    81
            1. Introduction
            This document describes the application and its intended purpose.
            """;
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(officialTemplate, "Table of Contents")).isTrue();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(submitted, "Table of Contents")).isTrue();
        var claimedMissing = missing("Table of Contents", "Table of Contents");
        var raw = review(List.of(), List.of(claimedMissing), "The Table of Contents is missing.",
            "Add the Table of Contents.");
        var processed = AiReviewService.postprocessForBenchmark(raw, "Software Requirements Specification",
            "", officialTemplate, submitted);
        assertThat(processed.missingRequiredSections()).doesNotContain(claimedMissing);
        assertThat(processed.summary()).doesNotContain("Table of Contents is missing");
    }

    @Test void aStandaloneTitleOrIncidentalMentionDoesNotFalselyProveAnIndexExists() {
        assertThat(AiReviewGroundingPolicy.containsBodyHeading("""
            1. Introduction
            The application will contain a Table of Contents when the documentation is finished.
            """, "Table of Contents")).isFalse();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading("""
            Table of Contents
            Draft index pending.
            1. Introduction
            A description of the project.
            """, "Table of Contents")).isFalse();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading("""
            Table of Contents
            1. Introduction ................................... 4
            2. Overview ....................................... 5
            """, "Table of Contents")).isTrue();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading("""
            Table of Contents
            1. Introduction
            1.1 Purpose
            2. Overview
            """, "Table of Contents")).isTrue();
    }

    @Test void aProviderFindingThatExplicitlyClaimsAnExistingIndexIsMissingIsAlsoFiltered() {
        String submitted = """
            Table of Contents
            Change History .................................... 2
            Introduction ...................................... 4
            1. Introduction
            Project purpose and scope.
            """;
        var alleged = new AiReviewProvider.Finding("The Table of Contents section is missing.",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE,
            "No index detected on the submitted PDF", "Table of Contents");
        var filtered = AiReviewService.postprocessForBenchmark(review(List.of(alleged), List.of(),
            "The Table of Contents is missing.", "Add an index."),
            "Software Requirements Specification", "", "Table of Contents", submitted);
        assertThat(filtered.findings()).isEmpty();
    }

    @Test void existingNumberedAndUnnumberedBodyHeadingsAreNotReportedMissing() {
        String docText = """
            Table of Contents
            Change History
            1. Introduction .................................... 2
            2. Test Plan ........................................ 3
            3. Test Cases ....................................... 4
            Appendix (Test Logs) ................................ 5
            Change History
            Project alpha revised.
            1. Introduction
            Introduction body.
            II. Test Plan
            Plan body.
            3 Test Cases
            Case body.
            Appendix (Test Logs)
            Report body.
            """;
        for (String heading : List.of("Change History", "1. Introduction", "2. Test Plan",
                "3. Test Cases", "Appendix (Test Logs)")) {
            assertThat(AiReviewGroundingPolicy.containsBodyHeading(docText, heading))
                .as("present body heading " + heading).isTrue();
        }
        var raw = review(List.of(), List.of(
            missing("Change History", "Change History"),
            missing("1. Introduction", "1. Introduction"),
            missing("2. Test Plan", "2. Test Plan"),
            missing("3. Test Cases", "3. Test Cases"),
            missing("Appendix (Test Logs)", "Appendix (Test Logs)")),
            "Every section is missing.", "Add everything.");
        String authority = "Change History\n1. Introduction\n2. Test Plan\n3. Test Cases\nAppendix (Test Logs)";
        assertThat(AiReviewService.postprocessForBenchmark(raw, "Software Test Document", "",
            authority, docText).missingRequiredSections()).isEmpty();
    }

    @Test void refusesInventedSectionWhenQuotedAuthorityNamesOnlyRelatedContent() {
        assertThat(AiReviewGroundingPolicy.sectionNamedByRequirement("Supporting Evidence",
            "Supply screenshots, logs, and evidence of testing.",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS)).isFalse();
        assertThat(AiReviewGroundingPolicy.sectionNamedByRequirement("Test Execution and Results",
            "Trace the relationship from Test Cases to Test Execution to Test Results.",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS)).isFalse();
        assertThat(AiReviewGroundingPolicy.sectionNamedByRequirement("Test Cases",
            "Trace the relationship from Test Cases to Test Results.",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS)).isFalse();
        assertThat(AiReviewGroundingPolicy.sectionNamedByRequirement("Functional Requirements",
            INSTRUCTIONS, AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS)).isTrue();
        assertThat(AiReviewGroundingPolicy.sectionNamedByRequirement("Test Cases",
            "3. Test Cases",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE)).isTrue();
        var input = review(List.of(), List.of(
            new AiReviewProvider.MissingRequiredSection("Supporting Evidence",
                AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
                "Include evidence. Submit the Supporting Evidence section.")),
            "Missing evidence.", "Add evidence.");
        assertThat(AiReviewService.postprocessForBenchmark(input, "SRS",
            "Include evidence. Submit the Supporting Evidence section.", "", "SRS\nBody"))
            .extracting(AiReviewProvider.Result::missingRequiredSections)
            .asList().hasSize(1); // named explicitly in supplied instructions, not over-filtered
    }

    @Test void filtersUnsupportedNamedSectionFromFindingWhileKeepingUnrelatedGroundedClaim() {
        var invented = new AiReviewProvider.Finding(
            "The 'Security Testing' section is missing.",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
            "Page 3", "Submit a PDF including functional requirements.");
        var valid = new AiReviewProvider.Finding(
            "Functional requirements are missing from the submitted document.",
            AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
            "Page 3", "Submit a PDF including functional requirements.");
        var raw = review(List.of(invented, valid), List.of(),
            "Security Testing section is missing.", "Add Security Testing and Functional Requirements.");
        var filtered = AiReviewService.postprocessForBenchmark(raw, "SRS",
            "Submit a PDF including functional requirements.", "", "Software Requirements Specification");
        assertThat(filtered.findings()).containsExactly(valid);
        assertThat(filtered.summary()).doesNotContain("Security Testing");
        assertThat(filtered.suggestedAction()).doesNotContain("Security Testing");
    }

    @Test void dropsSyntheticOnlyWrongDeliverableButKeepsActualBodyMismatch() {
        String correct = """
            Software Test Document
            WildTrack | Synthetic benchmark fixture
            1. Introduction
            WildTrack test cases, expected results, and execution logs for a controlled evaluation.
            """;
        var wronglyClassified = doc("This is a synthetic benchmark fixture, not a functional Software Test Document.");
        var raw = review(List.of(wronglyClassified), List.of(),
            "Not the requested deliverable.", "Replace document.");
        var processed = AiReviewService.postprocessForBenchmark(raw, "Software Test Document",
            "", "", correct);
        assertThat(processed.findings()).isEmpty();
        assertThat(processed.summary()).doesNotContain("not a functional", "wrong document");
        assertThat(processed.suggestedAction()).doesNotContain("Verify that the submitted PDF is the intended deliverable");

        String mismatch = "Software Test Document\nThis section describes a fictional social-media marketing campaign.";
        assertThat(AiReviewService.postprocessForBenchmark(raw, "Software Test Document",
            "", "", mismatch).findings()).containsExactly(wronglyClassified);
        assertThat(AiReviewService.postprocessForBenchmark(
            review(List.of(doc("The PDF identifies itself as a marketing plan rather than the requested STD.")),
                List.of(), "Wrong file.", "Replace file."),
            "Software Test Document", "", "", mismatch).findings()).hasSize(1);
    }

    @Test void stripsUnqualifiedAbsolutePlaceholderAllegationWithoutHidingPartialIncompleteness() {
        String partial = """
            Software Test Document
            1.1. System Overview
            WildTrack is a capstone submission workflow where students submit required deliverable links and assigned advisers review each team's responses and document check findings.
            1.2. Test Approach
            Insert methodology here
            """;
        var absolute = doc("The document consists entirely of section headers and placeholders with no actual project content.");
        var partialIssue = doc("The Test Approach contains the placeholder 'Insert methodology here'.");
        var filtered = AiReviewService.postprocessForBenchmark(
            review(List.of(absolute, partialIssue), List.of(), "Everything is blank.", "Replace entire file."),
            "Software Test Document", "", TEMPLATE, partial);
        assertThat(filtered.findings()).contains(partialIssue);
        assertThat(filtered.findings()).noneMatch(f -> f.issue().contains("consists entirely"));
        assertThat(filtered.summary()).doesNotContain("entirely");
    }

    @Test void templateSampleIdentityCannotBecomeNewRequirement() {
        String official = "Software Test Document\nSchedEase\n1. Introduction\nExample project.";
        String submitted = "Software Test Document\nWildTrack\n1. Introduction\nStudent-authored review.";
        var confused = doc("The project name should match SchedEase from the official template.");
        assertThat(AiReviewGroundingPolicy.findings(List.of(confused), "Software Test Document",
            submitted, official)).isEmpty();
        assertThat(AiReviewGroundingPolicy.findings(List.of(confused), "Software Test Document",
            official, official)).containsExactly(confused); // name occurs in the PDF, so do not guess
    }

    @Test void noTemplateNeverAuthorizesTemplateClaimsOrCopiesProviderSuggestedAction() {
        var raw = review(List.of(doc("The PDF states that validation evidence was not supplied.")),
            List.of(), "Missing mandatory template sections.", "Add mandatory testing evidence.");
        var safe = AiReviewService.postprocessForBenchmark(raw, "SRS",
            "Review this document.", "", "SRS\nValidation evidence was not supplied.");
        assertThat(safe.summary()).doesNotContain("mandatory template");
        assertThat(safe.suggestedAction()).doesNotContain("mandatory testing evidence");
        assertThat(safe.limitations()).anyMatch(s -> s.startsWith("No official template was supplied"));
    }

    @Test void existingInvalidQuoteStillFailsClosed() {
        var invalid = review(List.of(new AiReviewProvider.Finding(
            "Security section missing.", AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS,
            "Page 2", "This quotation does not occur in the supplied instructions.")),
            List.of(), "The requirements are missing.", "Add sections.");
        assertThatThrownBy(() -> AiReviewService.postprocessForBenchmark(invalid,
            "SRS", INSTRUCTIONS, "", "SRS"))
            .hasMessageContaining("invalid or ungrounded");
    }
}
