package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

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
    }
}
