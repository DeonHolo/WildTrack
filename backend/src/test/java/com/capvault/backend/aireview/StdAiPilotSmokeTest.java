package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

import com.capvault.backend.filecheck.PdfInspector;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/** An explicit, one-shot development smoke on STD-24, which is not among the ten Goal 2 pilot fixtures. */
class StdAiPilotSmokeTest {
    @Test
    void reviewOutOfPilotFixtureWithoutClaimingAnAccuracyResult() throws Exception {
        Assumptions.assumeTrue(Boolean.getBoolean("benchmark.ai.smoke"), "No live provider call without opt-in");
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path root = Files.exists(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
        Path keyFile = root.resolve(".env.smart-goal-2");
        assertThat(Files.exists(keyFile)).as("Local ignored key file is required").isTrue();
        String key = Files.readAllLines(keyFile).stream().filter(line -> line.trim().startsWith("GEMINI_API_KEY="))
            .map(line -> line.substring(line.indexOf('=') + 1).trim().replaceAll("^[\"']|[\"']$", ""))
            .findFirst().orElse("");
        assertThat(key).as("Set GEMINI_API_KEY in the ignored local file").isNotBlank();

        Path output = root.resolve(".scratch/capstone-2-session/goal2-STD24-provider-smoke.json");
        assertThat(Files.exists(output)).as("Do not repeat or overwrite the first provider attempt").isFalse();
        Path fixture = root.resolve("docs/capstone-2-build/benchmarks/std/fixtures/STD-24_toc-only-test-approach.pdf");
        Path template = root.resolve("docs/STD TEMPLATE.pdf");
        byte[] pdf = Files.readAllBytes(fixture);
        byte[] templatePdf = Files.readAllBytes(template);
        assertThat(sha256(pdf)).isEqualTo("7eb748bea9a85679da773831ccded55ac006c048e0d6e1161dbf4af55224fdfe");
        assertThat(sha256(templatePdf)).isEqualTo("de2826f3164c091ac5c73ba0cb22cd043fbf649d2831c94dbbcd443425dc416d");
        var inspector = new PdfInspector();
        var doc = inspector.inspect(pdf);
        var official = inspector.inspect(templatePdf);
        assertThat(doc.readable() && official.readable()).isTrue();

        String instructions = "Individual STD based on updated SRS and SDD. Trace updated SRS to system features, "
            + "test cases, test execution, and test results. Cover important applicable functional and non-functional "
            + "requirements using valid, invalid, missing, boundary, incorrect-action, unauthorized-access, and error cases. "
            + "Distinguish expected outputs from actual results; document incidents and resolutions. Supply supporting "
            + "screenshots, logs, recordings, system outputs, or other evidence of actual systematic testing.";
        var mapper = new ObjectMapper();
        var provider = new GeminiAiReviewProvider(key, RestClient.builder()
            .baseUrl("https://generativelanguage.googleapis.com").build(), mapper, 0);
        var input = new AiReviewProvider.Input("development-smoke-STD24", pdf, doc.extractedText(),
            AiReviewService.SYSTEM_INSTRUCTION, "Software Test Document (STD)", instructions, official.extractedText());
        String startedAt = Instant.now().toString();
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("type", "OUT_OF_PILOT_DEVELOPMENT_SMOKE_NOT_SMART_GOAL_2_ACCURACY");
        evidence.put("fixture_id", "STD-24");
        evidence.put("attempted_at", startedAt);
        evidence.put("fixture_sha256", sha256(pdf));
        evidence.put("template_sha256", sha256(templatePdf));
        evidence.put("app_prompt_version", AiReviewService.PROMPT_VERSION);
        evidence.put("adapter_version", provider.cacheVersion());
        evidence.put("note", "Uses the actual WildTrack Gemini provider on a fixture excluded from the frozen ten-case pilot. "
            + "This is not a human-reviewed accuracy measurement and cannot enter its denominator.");
        try {
            var result = provider.review(input); // exactly one call; do not retry automatically
            evidence.put("outcome", "fresh_provider_result");
            evidence.put("provider_report", result);
        } catch (GeminiAiReviewProvider.Failure failure) {
            evidence.put("outcome", "provider_failure");
            evidence.put("failure_code", failure.code); // never record the provider response body or credential
        } finally {
            evidence.put("finished_at", Instant.now().toString());
            Files.createDirectories(output.getParent());
            Files.writeString(output, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(evidence) + "\n");
        }
        assertThat(evidence.get("outcome")).as("One actual model smoke attempt; see ignored local evidence").isEqualTo("fresh_provider_result");
    }

    private static String sha256(byte[] value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
    }
}
