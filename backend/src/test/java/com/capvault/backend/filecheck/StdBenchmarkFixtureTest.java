package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

class StdBenchmarkFixtureTest {

    private final PdfInspector inspector = new PdfInspector();
    private final TemplateComparator comparator = new TemplateComparator(
        new FileCheckProperties(300, 0.75, 0.25)
    );

    @Test
    void frozenSyntheticFixturesRemainReadableAndExposeExpectedDeterministicSignals() throws IOException {
        Path repo = repositoryRoot();
        Path officialTemplate = repo.resolve("docs/STD TEMPLATE.pdf");
        Assumptions.assumeTrue(
            Files.exists(officialTemplate),
            "Owner-supplied docs/STD TEMPLATE.pdf is intentionally not required in environments where the private file is absent."
        );

        PdfInspection template = inspect(officialTemplate);
        assertThat(template.readable()).isTrue();
        assertThat(template.pageCount()).isEqualTo(7);
        assertThat(template.extractedCharacterCount()).isGreaterThan(300);
        assertThat(comparator.compare(template.extractedText(), template.extractedText()).appearsTemplateOnly()).isTrue();

        Path fixtures = repo.resolve("docs/capstone-2-build/benchmarks/std/fixtures");
        List<String> names = List.of(
            "STD-02_personalized-template-like.pdf",
            "STD-03_one-section-complete.pdf",
            "STD-05_meaningful-complete.pdf",
            "STD-08_repeated-filler.pdf",
            "STD-09_varied-irrelevant.pdf",
            "STD-10_wrong-document.pdf",
            "STD-12_missing-test-approach.pdf",
            "STD-18_incomplete-no-template.pdf",
            "STD-21_missing-execution-evidence.pdf",
            "STD-24_toc-only-test-approach.pdf"
        );
        for (String name : names) {
            PdfInspection inspection = inspect(fixtures.resolve(name));
            assertThat(inspection.readable()).as(name).isTrue();
            assertThat(inspection.extractedCharacterCount()).as(name).isGreaterThan(300);
        }

        TemplateComparison personalized = compare(template, fixtures.resolve("STD-02_personalized-template-like.pdf"));
        assertThat(personalized.appearsTemplateOnly()).isTrue();
        assertThat(personalized.missingTemplateHeadings()).isEmpty();

        TemplateComparison partial = compare(template, fixtures.resolve("STD-03_one-section-complete.pdf"));
        assertThat(partial.appearsTemplateOnly()).isFalse();
        assertThat(partial.missingTemplateHeadings()).isEmpty();

        TemplateComparison complete = compare(template, fixtures.resolve("STD-05_meaningful-complete.pdf"));
        assertThat(complete.appearsTemplateOnly()).isFalse();
        assertThat(complete.missingTemplateHeadings()).isEmpty();

        TemplateComparison requiredSectionMissing = compare(template, fixtures.resolve("STD-12_missing-test-approach.pdf"));
        assertThat(requiredSectionMissing.missingTemplateHeadings()).contains("Test Approach");

        TemplateComparison tocOnly = compare(template, fixtures.resolve("STD-24_toc-only-test-approach.pdf"));
        assertThat(tocOnly.missingTemplateHeadings()).contains("Test Approach");
    }

    private PdfInspection inspect(Path path) throws IOException {
        return inspector.inspect(Files.readAllBytes(path));
    }

    private TemplateComparison compare(PdfInspection template, Path submission) throws IOException {
        return comparator.compare(template.extractedText(), inspect(submission).extractedText());
    }

    private static Path repositoryRoot() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        if (Files.exists(cwd.resolve("backend/pom.xml"))) {
            return cwd;
        }
        if (Files.exists(cwd.resolve("pom.xml")) && "backend".equalsIgnoreCase(cwd.getFileName().toString())) {
            return cwd.getParent();
        }
        return cwd;
    }
}
