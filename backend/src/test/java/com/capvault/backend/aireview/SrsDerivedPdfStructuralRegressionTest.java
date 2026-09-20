package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.capvault.backend.filecheck.PdfInspector;
import org.junit.jupiter.api.Test;

/** Exercises the exact extracted text of the six sanitized PDFs, not fabricated plain-text headings. */
class SrsDerivedPdfStructuralRegressionTest {
    private static final Path BASE = Path.of("docs/capstone-2-build/benchmarks/srs");

    private static Path root() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.isRegularFile(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }
    private static String pdf(String id, String filename) throws Exception {
        var inspection = new PdfInspector().inspect(Files.readAllBytes(root().resolve(BASE)
            .resolve("fixtures").resolve(id + "_" + filename + ".pdf")));
        assertThat(inspection.readable()).as(id + " PDFBox readability").isTrue();
        assertThat(inspection.pageCount()).isGreaterThan(0);
        return inspection.extractedText();
    }
    private static AiReviewProvider.Result mock(List<AiReviewProvider.MissingRequiredSection> missing) {
        return new AiReviewProvider.Result("Mocked incomplete SRS", List.of(), missing, List.of(),
            "Mocked add missing sections");
    }
    private static AiReviewProvider.MissingRequiredSection missing(String name) {
        return new AiReviewProvider.MissingRequiredSection(name,
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE, name);
    }

    @Test void templateHeadingsPresentButDoNotProveCompletedBody() throws Exception {
        String template = pdf("SRS-01", "template-only");
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(template, "2.4 Constraints")).isTrue();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(template, "3.1.3 Communications interfaces")).isTrue();
        assertThat(template).contains("PLACEHOLDER:");
    }
    @Test void completedSyntheticSrsDoesNotHaveFabricatedMissingSubsections() throws Exception {
        String safeTemplate = pdf("SRS-01", "template-only");
        String complete = pdf("SRS-02", "completed");
        var result = AiReviewService.postprocessForBenchmark(mock(List.of(
            missing("2.4 Constraints"), missing("3.1.3 Communications interfaces"))),
            "Software Requirements Specification (SRS)", "", safeTemplate, complete);
        assertThat(result.missingRequiredSections()).isEmpty();
        assertThat(complete).contains("FR-01", "NFR-01");
    }
    @Test void tocOnlyConstraintIsNotMistakenForItsMissingBodySection() throws Exception {
        String safeTemplate = pdf("SRS-01", "template-only");
        String tocOnly = pdf("SRS-04", "toc-only-heading");
        assertThat(tocOnly).contains("2.4. Constraints");
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(tocOnly, "2.4 Constraints")).isFalse();
        var result = AiReviewService.postprocessForBenchmark(mock(List.of(missing("2.4 Constraints"))),
            "Software Requirements Specification (SRS)", "", safeTemplate, tocOnly);
        assertThat(result.missingRequiredSections())
            .extracting(AiReviewProvider.MissingRequiredSection::section).contains("2.4 Constraints");
    }
    @Test void genuinelyMissingCommunicationBodySectionRemainsMissing() throws Exception {
        String safeTemplate = pdf("SRS-01", "template-only");
        String absent = pdf("SRS-05", "section-missing");
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(absent, "3.1.3 Communications interfaces")).isFalse();
        var result = AiReviewService.postprocessForBenchmark(mock(List.of(
            missing("3.1.3 Communications interfaces"), missing("3.1.2 Software interfaces"))),
            "Software Requirements Specification (SRS)", "", safeTemplate, absent);
        assertThat(result.missingRequiredSections())
            .extracting(AiReviewProvider.MissingRequiredSection::section)
            .containsExactly("3.1.3 Communications interfaces");
    }
    @Test void embeddedBogusSectionCannotBecomeNewTemplateAuthority() throws Exception {
        String safeTemplate = pdf("SRS-01", "template-only");
        String poisoned = pdf("SRS-06", "bogus-requirement");
        assertThat(poisoned).contains("Quantum Registry Certification");
        assertThat(safeTemplate).doesNotContain("Quantum Registry Certification");
        assertThat(AiReviewGroundingPolicy.sectionNamedByRequirement(
            "Section 4 Quantum Registry Certification", "3. Specific Requirements",
            AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE)).isFalse();
    }
}
