package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/**
 * An explicitly invoked benchmark observation exporter. Produces actual PdfInspector and
 * TemplateComparator observations, including failures, for the frozen prepared STD fixtures.
 * This class is skipped by ordinary test suites unless an output path is provided.
 */
class StdBenchmarkObservationExportTest {
    private static final String HEADER =
        "fixture_id,readable,pages,extracted_characters,template_coverage,added_content_ratio,"
        + "template_only,missing_template_headings,observation_status,fixture_sha256,"
        + "template_sha256,app_commit,measured_at,template_available,check_error,code_state";

    private final PdfInspector inspector = new PdfInspector();
    private final TemplateComparator comparator = new TemplateComparator(new FileCheckProperties(300, 0.75, 0.25));

    @Test
    void exportFrozenFixtureObservationsWhenExplicitlyRequested() throws Exception {
        String requestedOutput = System.getProperty("benchmark.observations.output", "");
        Assumptions.assumeTrue(!requestedOutput.isBlank(), "Explicit benchmark output path required");
        String commit = System.getProperty("benchmark.app.commit", "");
        assertThat(commit).matches("[0-9a-fA-F]{40}");

        Path root = repositoryRoot();
        assertThat(git(root, "rev-parse", "HEAD")).as("The supplied revision must match the actual checkout")
            .isEqualToIgnoringCase(commit);
        assertThat(git(root, "status", "--porcelain", "--untracked-files=no", "--",
            "backend/src/main/java/com/capvault/backend/filecheck", "backend/pom.xml"))
            .as("Production Document Check implementation is dirty; commit reviewed code before a SHA-labeled benchmark run")
            .isBlank();
        Path output = Path.of(requestedOutput).toAbsolutePath().normalize();
        assertThat(Files.exists(output)).as("Refuse to overwrite an earlier observation record").isFalse();
        Path templatePath = root.resolve("docs/STD TEMPLATE.pdf");
        assertThat(templatePath).exists();
        byte[] templateBytes = Files.readAllBytes(templatePath);
        PdfInspection template = inspector.inspect(templateBytes);
        assertThat(template.readable()).as("Official template readable").isTrue();
        String templateHash = hash(templateBytes);

        String[][] prepared = {
            {"STD-01", "docs/STD TEMPLATE.pdf"},
            {"STD-02", "docs/capstone-2-build/benchmarks/std/fixtures/STD-02_personalized-template-like.pdf"},
            {"STD-03", "docs/capstone-2-build/benchmarks/std/fixtures/STD-03_one-section-complete.pdf"},
            {"STD-05", "docs/capstone-2-build/benchmarks/std/fixtures/STD-05_meaningful-complete.pdf"},
            {"STD-08", "docs/capstone-2-build/benchmarks/std/fixtures/STD-08_repeated-filler.pdf"},
            {"STD-09", "docs/capstone-2-build/benchmarks/std/fixtures/STD-09_varied-irrelevant.pdf"},
            {"STD-10", "docs/capstone-2-build/benchmarks/std/fixtures/STD-10_wrong-document.pdf"},
            {"STD-12", "docs/capstone-2-build/benchmarks/std/fixtures/STD-12_missing-test-approach.pdf"},
            {"STD-18", "docs/capstone-2-build/benchmarks/std/fixtures/STD-18_incomplete-no-template.pdf"},
            {"STD-21", "docs/capstone-2-build/benchmarks/std/fixtures/STD-21_missing-execution-evidence.pdf"},
            {"STD-24", "docs/capstone-2-build/benchmarks/std/fixtures/STD-24_toc-only-test-approach.pdf"}
        };

        List<String> lines = new ArrayList<>();
        lines.add(HEADER);
        for (String[] fixture : prepared) {
            String id = fixture[0];
            Path input = root.resolve(fixture[1]);
            String fixtureHash = "";
            String error = "";
            PdfInspection inspected = null;
            TemplateComparison compared = null;
            boolean withTemplate = !"STD-18".equals(id);
            try {
                byte[] bytes = Files.readAllBytes(input);
                fixtureHash = hash(bytes);
                inspected = inspector.inspect(bytes);
                if (inspected.readable() && withTemplate) {
                    compared = comparator.compare(template.extractedText(), inspected.extractedText());
                }
            } catch (Exception exception) {
                error = exception.getClass().getSimpleName() + ": " + exception.getMessage();
            }
            lines.add(csv(id, inspected == null ? "" : String.valueOf(inspected.readable()),
                inspected == null ? "" : String.valueOf(inspected.pageCount()),
                inspected == null ? "" : String.valueOf(inspected.extractedCharacterCount()),
                compared == null ? "" : String.valueOf(compared.templateCoverage()),
                compared == null ? "" : String.valueOf(compared.addedContentRatio()),
                compared == null ? "" : String.valueOf(compared.appearsTemplateOnly()),
                compared == null ? "" : String.join("; ", compared.missingTemplateHeadings()),
                error.isBlank() ? "SUCCESS" : "ERROR",
                fixtureHash, templateHash, commit, Instant.now().toString(),
                String.valueOf(compared != null && compared.available()), error, "TRACKED_FILECHECK_CLEAN"));
        }
        Files.createDirectories(output.getParent());
        Files.writeString(output, String.join("\n", lines) + "\n", StandardCharsets.UTF_8);
        assertThat(Files.readAllLines(output)).hasSize(prepared.length + 1);
    }

    private static String csv(String... fields) {
        List<String> quoted = new ArrayList<>();
        for (String field : fields) quoted.add("\"" + field.replace("\"", "\"\"") + "\"");
        return String.join(",", quoted);
    }

    private static String hash(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String git(Path root, String... arguments) throws Exception {
        List<String> command = new ArrayList<>(List.of("git"));
        command.addAll(List.of(arguments));
        Process process = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        assertThat(process.waitFor()).as("Git command failed: " + String.join(" ", command)).isZero();
        return output;
    }

    private static Path repositoryRoot() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.exists(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }
}
