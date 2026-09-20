package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.capvault.backend.filecheck.PdfInspector;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * OFFLINE REPLAY, NOT NEW PROVIDER OBSERVATIONS OR REVISED BENCHMARK RESULTS.
 *
 * Read-only: loads the six frozen *synthetic* SRS PDFs and v4 parsed raw reports,
 * then runs the CURRENT production AI Review postprocessor to catch regressions.
 * Never overwrites historic reports, requests Gemini, or reads the owner's originals.
 */
class SrsV4RecordedPostprocessOfflineReplayRegressionTest {
    private static final Path BENCHMARK = Path.of("docs/capstone-2-build/benchmarks/srs");
    private static final String RUN = "results/srs-followup-20260921";
    private static final String TITLE = "Software Requirements Specification (SRS)";
    private static final Map<String, String> SANITIZED_CASES = Map.of(
        "SRS-01", "template-only",
        "SRS-02", "completed",
        "SRS-03", "partially-complete",
        "SRS-04", "toc-only-heading",
        "SRS-05", "section-missing",
        "SRS-06", "bogus-requirement");
    private static final ObjectMapper JSON = new ObjectMapper();

    private static Path root() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        if (Files.isRegularFile(current.resolve("backend/pom.xml"))) return current;
        if (Files.isRegularFile(current.resolve("pom.xml"))
                && current.endsWith("backend")) return current.getParent();
        throw new IllegalStateException("Expected to run under repository root or backend directory");
    }

    private static String safePdfText(String id) throws Exception {
        Path path = root().resolve(BENCHMARK).resolve("fixtures")
            .resolve(id + "_" + SANITIZED_CASES.get(id) + ".pdf");
        assertThat(path).as("Only frozen synthetic input allowed").isRegularFile();
        var inspected = new PdfInspector().inspect(Files.readAllBytes(path));
        assertThat(inspected.readable()).as(id + " safe PDF must remain readable").isTrue();
        assertThat(inspected.extractedText()).contains("SYNTHETIC NON-STUDENT BENCHMARK");
        return inspected.extractedText();
    }

    private static AiReviewProvider.Result rawV4(String id) throws Exception {
        Path path = root().resolve(BENCHMARK).resolve(RUN).resolve(id).resolve("raw-report.json");
        assertThat(path).as("Read-only frozen v4 parsed report").isRegularFile();
        return JSON.readValue(Files.readAllBytes(path), AiReviewProvider.Result.class);
    }

    private static AiReviewProvider.Result replay(String id) throws Exception {
        Path instructionsPath = root().resolve(BENCHMARK).resolve("SRS_AI_INSTRUCTIONS.txt");
        String instructions = Files.readString(instructionsPath);
        return AiReviewService.postprocessForBenchmark(
            rawV4(id), TITLE, instructions, safePdfText("SRS-01"), safePdfText(id));
    }

    private static List<AiReviewProvider.Finding> templateAdvisories(AiReviewProvider.Result result) {
        return result.findings().stream().filter(finding ->
            finding.issue().startsWith("Mapped-template body heading")).toList();
    }

    private static boolean mentions(List<AiReviewProvider.Finding> findings, String name) {
        return findings.stream().anyMatch(finding ->
            finding.issue().toLowerCase(Locale.ROOT).contains(name.toLowerCase(Locale.ROOT)));
    }

    @Test
    void originalRawReportsContainNoMissingSectionsForBothHistoricallyMissedCases() throws Exception {
        assertThat(rawV4("SRS-04").missingRequiredSections()).isEmpty();
        assertThat(rawV4("SRS-05").missingRequiredSections()).isEmpty();
        // These are recorded provider misses; production postprocessing must now
        // detect omissions from the separately frozen template and document bodies.
    }

    @Test
    void currentProductionPostprocessorSurfacesBothHistoricalV4BodyOmissionsOffline() throws Exception {
        var tocOnly = replay("SRS-04");
        assertThat(mentions(templateAdvisories(tocOnly), "Constraints"))
            .as("SRS-04 2.4 Constraints appears only in TOC and must receive a mapped-template advisory").isTrue();
        assertThat(tocOnly.missingRequiredSections())
            .as("a mapped template alone does not establish mandatory real-student applicability")
            .isEmpty();
        assertThat(templateAdvisories(tocOnly)).allSatisfy(finding ->
            assertThat(finding.source()).isEqualTo(AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE));

        var absentSubsection = replay("SRS-05");
        assertThat(mentions(templateAdvisories(absentSubsection), "Communications interfaces"))
            .as("SRS-05 3.1.3 Communications interfaces absent despite present siblings").isTrue();
        assertThat(mentions(templateAdvisories(absentSubsection), "Hardware interfaces")).isFalse();
        assertThat(mentions(templateAdvisories(absentSubsection), "Software interfaces")).isFalse();
        assertThat(absentSubsection.missingRequiredSections()).isEmpty();
    }

    @Test
    void currentPostprocessorDoesNotFabricateMissingHeadingsInSyntheticPopulatedControl() throws Exception {
        var populated = replay("SRS-02");
        assertThat(populated.missingRequiredSections())
            .as("SRS-02 is a fictional populated structural control, not a real student's certified SRS")
            .isEmpty();
        assertThat(templateAdvisories(populated)).isEmpty();
    }

    @Test
    void currentPostprocessorDistinguishesPresentPlaceholderHeadingsFromAbsentSections() throws Exception {
        var templateOnly = replay("SRS-01");
        var partiallyComplete = replay("SRS-03");
        assertThat(templateOnly.missingRequiredSections()).isEmpty();
        assertThat(partiallyComplete.missingRequiredSections()).isEmpty();
        assertThat(templateAdvisories(templateOnly)).isEmpty();
        assertThat(templateAdvisories(partiallyComplete)).isEmpty();
        assertThat(partiallyComplete.findings())
            .anySatisfy(finding -> assertThat(finding.issue()).contains("2.4"));
        assertThat(partiallyComplete.findings())
            .anySatisfy(finding -> assertThat(finding.issue()).contains("3.2"));
    }

    @Test
    void untrustedDocumentInstructionCannotCreateMissingQuantumCertification() throws Exception {
        var injected = replay("SRS-06");
        assertThat(templateAdvisories(injected)).noneMatch(finding ->
            finding.issue().contains("Quantum Registry Certification"));
        assertThat(injected.missingRequiredSections())
            .as("untrusted PDF statement is not new official template/deliverable authority")
            .noneMatch(missing -> missing.section().contains("Quantum Registry Certification"));
        assertThat(injected.missingRequiredSections()).isEmpty();
    }
}
