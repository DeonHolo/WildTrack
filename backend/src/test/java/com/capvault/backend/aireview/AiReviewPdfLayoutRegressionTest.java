package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.capvault.backend.filecheck.PdfInspector;
import org.junit.jupiter.api.Test;

class AiReviewPdfLayoutRegressionTest {
    private static final List<String> HEADINGS = List.of(
        "1.1. Purpose", "1.2. Scope", "1.3. Definitions, Acronyms and Abbreviations");
    private static final String TEMPLATE = """
        1.1. Purpose
        Explain the document purpose.
        1.2. Scope
        Explain the project scope.
        1.3. Definitions, Acronyms and Abbreviations
        Define terms used in the document.
        1.4. References
        List references used in the document.
        """;

    @Test void choosesEarliestBodyAnchorAcrossTocEntriesRatherThanFirstEntryRepeatedLate() {
        String text = """
            Software Requirements Specification
            Table of Contents
            1.4. References
            1.1. Purpose
            1.2. Scope
            1.3. Definitions, Acronyms and Abbreviations
            Page 4 of 8
            1.1. Purpose
            This document explains a university capstone submission and review system.
            1.2. Scope
            Students submit documents and assigned advisers review their project work.
            1.3. Definitions, Acronyms and Abbreviations
            SRS means Software Requirements Specification for the documented project.
            1.4. References
            This project cites an independent publication explaining software requirements.
            """;
        assertPresentHeadings(text);
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(
            TEMPLATE, text, "", List.of(), List.of()))
            .noneMatch(finding -> HEADINGS.stream().anyMatch(finding.issue()::contains));
    }

    @Test void checkedInCapVaultPdfDoesNotLosePageFiveBodyHeadingsToItsToc() throws Exception {
        Path fixture = Path.of("..", "docs", "old documents",
            "SRS (2526-sem2-it332-41) (CapVault).pdf");
        if (!Files.isRegularFile(fixture)) fixture = Path.of("docs", "old documents",
            "SRS (2526-sem2-it332-41) (CapVault).pdf");
        if (!Files.isRegularFile(fixture)) fixture = Path.of("..", "docs",
            "SRS (2526-sem2-it332-41) (CapVault).pdf");
        if (!Files.isRegularFile(fixture)) fixture = Path.of("docs",
            "SRS (2526-sem2-it332-41) (CapVault).pdf");
        assertThat(Files.isRegularFile(fixture)).as("checked-in CapVault PDF fixture").isTrue();
        var inspection = new PdfInspector().inspect(Files.readAllBytes(fixture));
        assertThat(inspection.readable()).isTrue();
        assertThat(inspection.pageCount()).isEqualTo(43);
        assertPresentHeadings(inspection.extractedText());
        assertThat(AiReviewGroundingPolicy.templateBodyCrosscheck(
            TEMPLATE, inspection.extractedText(), "", List.of(), List.of()))
            .noneMatch(finding -> HEADINGS.stream().anyMatch(finding.issue()::contains));
    }

    @Test void repeatedTocEntriesWithoutSubstantiveBodyDoNotEstablishPresence() {
        String text = """
            Table of Contents
            1.1. Purpose
            1.2. Scope
            1.3. Definitions, Acronyms and Abbreviations
            1.1. Purpose
            1.2. Scope
            1.3. Definitions, Acronyms and Abbreviations
            """;
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(text, "1.1. Purpose")).isFalse();
    }

    @Test void splitHeadingNumberAndTitleRetainActualBodyPresence() {
        String text = """
            Table of Contents
            1.1. Purpose
            1.2. Scope
            Page 2 of 4
            1.1.
            Purpose
            The system records submitted capstone documents for assigned university reviewers.
            1.2. Scope
            Students submit PDF documents while staff provide advisory review and feedback.
            """;
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(text, "1.1. Purpose")).isTrue();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(text, "1.4. References")).isFalse();
    }

    private static void assertPresentHeadings(String text) {
        for (String heading : HEADINGS) {
            assertThat(AiReviewGroundingPolicy.containsBodyHeading(text, heading))
                .as("present body heading %s", heading).isTrue();
        }
    }
}
