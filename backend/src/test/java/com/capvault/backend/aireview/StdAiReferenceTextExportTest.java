package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import com.capvault.backend.filecheck.PdfInspector;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

/** Opt-in local text extraction for auditing controlled, synthetic reference PDFs; never invokes Gemini. */
class StdAiReferenceTextExportTest {
    @Test
    void exportControlledTextForSourceBasedReferenceChecklist() throws Exception {
        Assumptions.assumeTrue(Boolean.getBoolean("benchmark.ai.extract.reference"));
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path root = Files.exists(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
        var sources = new LinkedHashMap<String, String>();
        sources.put("STD-01", "docs/STD TEMPLATE.pdf");
        sources.put("STD-02", "docs/capstone-2-build/benchmarks/std/fixtures/STD-02_personalized-template-like.pdf");
        sources.put("STD-03", "docs/capstone-2-build/benchmarks/std/fixtures/STD-03_one-section-complete.pdf");
        sources.put("STD-05", "docs/capstone-2-build/benchmarks/std/fixtures/STD-05_meaningful-complete.pdf");
        sources.put("STD-08", "docs/capstone-2-build/benchmarks/std/fixtures/STD-08_repeated-filler.pdf");
        sources.put("STD-09", "docs/capstone-2-build/benchmarks/std/fixtures/STD-09_varied-irrelevant.pdf");
        sources.put("STD-10", "docs/capstone-2-build/benchmarks/std/fixtures/STD-10_wrong-document.pdf");
        sources.put("STD-12", "docs/capstone-2-build/benchmarks/std/fixtures/STD-12_missing-test-approach.pdf");
        sources.put("STD-18", "docs/capstone-2-build/benchmarks/std/fixtures/STD-18_incomplete-no-template.pdf");
        sources.put("STD-21", "docs/capstone-2-build/benchmarks/std/fixtures/STD-21_missing-execution-evidence.pdf");
        Path output = root.resolve(".scratch/capstone-2-session/goal2-reference-extracted-text");
        Files.createDirectories(output);
        var inspector = new PdfInspector();
        for (Map.Entry<String, String> entry : sources.entrySet()) {
            var pdf = inspector.inspect(Files.readAllBytes(root.resolve(entry.getValue())));
            assertThat(pdf.readable()).as(entry.getKey()).isTrue();
            Files.writeString(output.resolve(entry.getKey() + ".txt"), pdf.extractedText());
        }
    }
}
