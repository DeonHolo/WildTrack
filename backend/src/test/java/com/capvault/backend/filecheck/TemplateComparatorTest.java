package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class TemplateComparatorTest {

    private final TemplateComparator comparator = new TemplateComparator(
        new FileCheckProperties(300, 0.75, 0.25)
    );

    @Test
    void flagsSubmissionThatMostlyRepeatsTheTemplate() {
        String template = """
            SOFTWARE REQUIREMENTS SPECIFICATION
            1. INTRODUCTION
            Describe the purpose and intended audience of the capstone system.
            2. FUNCTIONAL REQUIREMENTS
            List the functional requirements using clear identifiers.
            """;

        TemplateComparison result = comparator.compare(
            template,
            template + "\nCapVault"
        );

        assertThat(result.available()).isTrue();
        assertThat(result.appearsTemplateOnly()).isTrue();
        assertThat(result.templateCoverage()).isGreaterThanOrEqualTo(0.75);
    }

    @Test
    void acceptsSubstantialStudentContentBeyondTemplate() {
        String template = """
            SOFTWARE REQUIREMENTS SPECIFICATION
            1. INTRODUCTION
            Describe the purpose and intended audience of the capstone system.
            """;
        String submission = template + """

            CapVault coordinates deliverable links for hundreds of capstone students.
            Teachers can publish forms, monitor lateness, inspect submitted PDF files,
            and preserve final records. Advisers review their assigned teams while
            students see their own progress and actionable feedback.
            """;

        TemplateComparison result = comparator.compare(template, submission);

        assertThat(result.available()).isTrue();
        assertThat(result.appearsTemplateOnly()).isFalse();
        assertThat(result.addedContentRatio()).isGreaterThan(0.25);
    }

    @Test
    void excludesInstitutionalBoilerplateFromMissingHeadings() {
        String template = """
            CEBU INSTITUTE OF TECHNOLOGY - UNIVERSITY
            UNIVERSITY
            COLLEGE OF COMPUTER STUDIES
            SOFTWARE REQUIREMENTS SPECIFICATION
            1. PURPOSE
            2. FUNCTIONAL REQUIREMENTS
            """;

        TemplateComparison result = comparator.compare(
            template,
            "CapVault contains a detailed purpose for managing capstone submissions."
        );

        assertThat(result.missingTemplateHeadings())
            .doesNotContain(
                "CEBU INSTITUTE OF TECHNOLOGY - UNIVERSITY",
                "UNIVERSITY",
                "COLLEGE OF COMPUTER STUDIES",
                "SOFTWARE REQUIREMENTS SPECIFICATION"
            )
            .contains("FUNCTIONAL REQUIREMENTS");
    }

    @Test
    void tableOfContentsMentionDoesNotSatisfyMissingBodyHeading() {
        String template = """
            Table of Contents
            1. INTRODUCTION ........................................ 2
            1.2. TEST APPROACH ..................................... 2

            1. INTRODUCTION
            A real introduction body.
            1.2. TEST APPROACH
            A real test approach body.
            """;
        String submission = """
            Table of Contents
            1. INTRODUCTION ........................................ 2
            1.2. TEST APPROACH ..................................... 2

            1. INTRODUCTION
            A completed introduction body, but the Test Approach body section was removed.
            """;

        TemplateComparison result = comparator.compare(template, submission);

        assertThat(result.missingTemplateHeadings())
            .contains("TEST APPROACH")
            .doesNotContain("INTRODUCTION");
        assertThat(result.sectionEvidence()).filteredOn(evidence -> "INTRODUCTION".equals(evidence.expectedHeading()))
            .singleElement().satisfies(evidence -> {
                assertThat(evidence.status()).isEqualTo("DETECTED");
                assertThat(evidence.matchedLine()).isEqualTo("1. INTRODUCTION");
                assertThat(evidence.extractedTextLine()).isEqualTo(5);
                assertThat(evidence.matchMethod()).isEqualTo("NORMALIZED_EXACT");
            });
        assertThat(result.sectionEvidence()).filteredOn(evidence -> "TEST APPROACH".equals(evidence.expectedHeading()))
            .singleElement().satisfies(evidence -> {
                assertThat(evidence.status()).isEqualTo("NOT_DETECTED");
                assertThat(evidence.matchedLine()).isNull();
                assertThat(evidence.extractedTextLine()).isNull();
                assertThat(evidence.matchMethod()).isNull();
            });
    }

    @Test
    void exposesEveryMissingSectionRatherThanTruncatingResultsAtEight() {
        StringBuilder template = new StringBuilder();
        for (int number = 1; number <= 12; number++) {
            template.append(number).append(". Section ").append(number).append("\n");
        }

        TemplateComparison result = comparator.compare(template.toString(), "1. Section 1\nActual body content");

        assertThat(result.expectedTemplateHeadings()).hasSize(12);
        assertThat(result.detectedTemplateHeadings()).containsExactly("Section 1");
        assertThat(result.missingTemplateHeadings()).hasSize(11);
        assertThat(result.sectionEvidence()).hasSize(12);
    }

    @Test
    void savedReportsFromBeforeHeadingEvidenceRemainReadable() throws Exception {
        String priorReport = """
            {"available":true,"templateCoverage":0.42,"addedContentRatio":0.8,
             "unchangedInstructionCount":0,"missingTemplateHeadings":["Test Approach"],
             "appearsTemplateOnly":false,"expectedTemplateHeadings":["Introduction","Test Approach"],
             "detectedTemplateHeadings":["Introduction"]}
            """;

        TemplateComparison result = new ObjectMapper().readValue(priorReport, TemplateComparison.class);

        assertThat(result.sectionEvidence()).isEmpty();
        assertThat(result.detectedTemplateHeadings()).containsExactly("Introduction");
    }

    @Test
    void sampleProjectAndTransactionNamesAreNotTreatedAsRequiredTemplateSections() {
        String template = """
            Software Requirements Specifications
            for
            SKYSYNC

            Table of Contents
            1. Introduction ........................................ 2
            3.2. Functional requirements .......................... 8

            1. Introduction
            Describe the project.

            3.2. Functional requirements
            Module 1
            1.1 Transaction Name
            Use Case Diagram
            1.2 Transaction Name
            """;
        String submission = """
            Software Requirements Specifications
            for
            CapVault

            1. Introduction
            CapVault manages capstone submissions and review.

            3.2. Functional requirements
            Module 1
            1.1 Submit Deliverable
            The student submits a deliverable link.
            """;

        TemplateComparison result = comparator.compare(template, submission);

        assertThat(result.expectedTemplateHeadings())
            .contains("Introduction", "Functional requirements")
            .doesNotContain("SKYSYNC", "Transaction Name");
        assertThat(result.missingTemplateHeadings()).isEmpty();
    }

    @Test
    void docxTocPageNumbersAreNotPartOfRequiredSectionNames() {
        String template = """
            Table of Contents
            1. Introduction 4
            2. Test Plan 5
            3. Test Cases 6
            Introduction
            System overview and scope.
            Test Plan
            Testing approach.
            Test Cases
            Case details.
            """;
        var result = comparator.compare(template,
            "1. Introduction\nActual overview\n2. Test Plan\nActual plan\n3. Test Cases\nActual cases");

        assertThat(result.expectedTemplateHeadings()).containsExactly("Introduction", "Test Plan", "Test Cases");
        assertThat(result.missingTemplateHeadings()).isEmpty();
    }

    @Test
    void plainAndTabbedTocOnlyMentionsDoNotProveBodySections() {
        String template = "Table of Contents\n1. Introduction\t4\n2. Test Plan\t5\n3. Test Cases\t6";
        var result = comparator.compare(template, template);

        assertThat(result.expectedTemplateHeadings()).containsExactly("Introduction", "Test Plan", "Test Cases");
        assertThat(result.detectedTemplateHeadings()).isEmpty();
        assertThat(result.missingTemplateHeadings()).hasSize(3);
    }

    @Test
    void pageCountersDoNotBecomeTocTitlesOrHideRealEntries() {
        for (String counter : java.util.List.of("Page 4 of 7", "Page4of7", "4 of 7", "4 / 7", "Page 4", "4")) {
            String template = "Table of Contents\n1. Introduction ........ 4\n" + counter
                + "\n2. Test Plan 5\n" + counter
                + "\n1. Introduction\nOverview text.\n2. Test Plan\nPlan text.";

            var result = comparator.compare(template, "1. Introduction\nA written overview.");

            assertThat(result.expectedTemplateHeadings()).as(counter).containsExactly("Introduction", "Test Plan");
            assertThat(result.detectedTemplateHeadings()).as(counter).containsExactly("Introduction");
            assertThat(result.missingTemplateHeadings()).as(counter).containsExactly("Test Plan");
        }
    }

    @Test
    void pageCountersAreNotNumberedBodyHeadingsWithoutAToc() {
        var result = comparator.compare("1. Introduction\n4 of 7\n2. Test Plan\nPage 5 of 7",
            "1. Introduction\nOverview text.\n2. Test Plan\nPlan text.");

        assertThat(result.expectedTemplateHeadings()).containsExactly("Introduction", "Test Plan");
        assertThat(result.missingTemplateHeadings()).isEmpty();
    }

    @Test
    void literalNumbersInBodyHeadingNamesRemainSignificant() {
        var result = comparator.compare("1. Section 1\n2. Section 2", "1. Section 1\nSection text");

        assertThat(result.expectedTemplateHeadings()).containsExactly("Section 1", "Section 2");
        assertThat(result.detectedTemplateHeadings()).containsExactly("Section 1");
        assertThat(result.missingTemplateHeadings()).containsExactly("Section 2");
    }

    @Test
    void tocStopsAtTheRepeatedBodyHeadingEvenWhenItsNameEndsInANumber() {
        String template = "Table of Contents\n1. Section 1 4\n2. Section 2 5\n1. Section 1\n2. Section 2";
        var result = comparator.compare(template, template);

        assertThat(result.expectedTemplateHeadings()).containsExactly("Section 1", "Section 2");
        assertThat(result.detectedTemplateHeadings()).containsExactly("Section 1", "Section 2");
    }

    @Test
    void templatePlaceholderBranchesAreNotFixedRequiredSections() {
        String template = """
            Table of Contents
            1. Introduction 4
            3. Test Cases 6
            3.n Case-n 6
            3.n.1 Purpose 6
            3.n.2 Inputs 6

            Module 1 6
            A.2 Test Results 7
            Introduction
            Test Cases
            A.2 Test Results
            """;
        var result = comparator.compare(template, "Introduction\nTest Cases\nA.2 Test Results");

        assertThat(result.expectedTemplateHeadings()).containsExactly("Introduction", "Test Cases", "Test Results");
        assertThat(result.missingTemplateHeadings()).isEmpty();
    }
}
