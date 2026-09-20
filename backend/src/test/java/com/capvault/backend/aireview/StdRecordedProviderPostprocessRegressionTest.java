package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * Historical counterfactual: feed the ORIGINAL unchanged 2026-09-21 raw Gemini STD reports
 * through the production WildTrack post-processor. This is not a new provider run, and cannot
 * retroactively replace the original frozen benchmark measurement or its failed tenth case.
 */
class StdRecordedProviderPostprocessRegressionTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Path DIRECTORY = Path.of("docs/capstone-2-build/benchmarks/std");

    private static Path repo() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.isRegularFile(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }
    private static AiReviewProvider.Result apply(String id) throws Exception {
        Path root = repo();
        Path base = root.resolve(DIRECTORY);
        var original = JSON.readValue(Files.readAllBytes(base.resolve("results/goal2-20260921/reports/" + id + ".json")),
            AiReviewProvider.Result.class);
        String pdf = Files.readString(base.resolve("results/goal2-20260921/source-text/" + id + ".txt"));
        String template = "STD-18".equals(id) ? "" :
            Files.readString(base.resolve("results/goal2-20260921/source-text/STD-01.txt"));
        String instructions = "STD-18".equals(id)
            ? "Review this submitted Software Test Document and report observations supported by the PDF. No official template is supplied."
            : Files.readString(base.resolve("STD_AI_INSTRUCTIONS.txt"));
        return AiReviewService.postprocessForBenchmark(original, "Software Test Document (STD)",
            instructions, template, pdf);
    }
    @Test void noLongerInventsMissingExistingHeadings() throws Exception {
        assertThat(apply("STD-02").missingRequiredSections())
            .as("STD-02 has body headings despite largely empty sections").isEmpty();
    }
    @Test void completedOverviewIsNotDeclaredEntirelyAbsent() throws Exception {
        assertThat(apply("STD-03").findings())
            .noneMatch(finding -> finding.issue().contains("entirely of section headers"));
        assertThat(apply("STD-03").missingRequiredSections())
            .extracting(AiReviewProvider.MissingRequiredSection::section)
            .doesNotContain("Test Execution and Results", "Supporting Evidence");
    }
    @Test void doesNotCallAControlledCorrectTypeFixtureTheWrongDeliverable() throws Exception {
        assertThat(apply("STD-05").findings())
            .noneMatch(finding -> finding.issue().contains("not a functional Software Test Document"));
    }
    @Test void realMissingBodySectionIsStillReported() throws Exception {
        assertThat(apply("STD-12").missingRequiredSections())
            .extracting(AiReviewProvider.MissingRequiredSection::section)
            .contains("1.2. Test Approach");
    }
    @Test void retainsOtherActualObservationsAndNoTemplateLimitation() throws Exception {
        assertThat(apply("STD-08").findings())
            .anyMatch(finding -> finding.issue().toLowerCase().contains("filler"));
        assertThat(apply("STD-18").limitations())
            .anyMatch(text -> text.startsWith("No official template was supplied"));
        assertThat(apply("STD-18").suggestedAction())
            .doesNotContain("all required validation evidence");
    }
}
