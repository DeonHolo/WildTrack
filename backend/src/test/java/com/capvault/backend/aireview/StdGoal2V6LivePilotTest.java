package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import com.capvault.backend.filecheck.PdfInspector;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.client.RestClient;

/**
 * Fresh, separate Goal 2 controlled synthetic STD follow-up. NOT a retry of any
 * prior STD/SRS attempt. Ordinary Maven tests NEVER call Gemini. Only the new,
 * frozen, safe synthetic PDF folder is accepted as provider input.
 *
 * One durable CREATE_NEW attempt claim is written BEFORE network transmission.
 * A failed/uncertain claim must be preserved, never removed to obtain a better
 * result. This invokes the identical postprocessor used in live AiReviewService.
 */
class StdGoal2V6LivePilotTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Path BENCHMARK = Path.of("docs/capstone-2-build/benchmarks/std-goal2-v6");
    private static final Path DEFAULT_ATTEMPTS = Path.of(".scratch/capstone-2-session/goal2-v6/attempts");

    @Test
    void exposeExactProviderCacheFingerprintWithoutNetworkWhenExplicitlyRequested() {
        Assumptions.assumeTrue(Boolean.getBoolean("benchmark.goal2v6.print-cache"));
        System.out.println("GOAL2_V6_PROVIDER_CACHE_VERSION="
            + new GeminiAiReviewProvider("not-a-key", RestClient.builder().build(), JSON, 0).cacheVersion());
    }

    @Test
    void runOneFrozenSyntheticStdAgainstActualProviderAndProductionPostprocessor() throws Exception {
        Assumptions.assumeTrue(Boolean.getBoolean("benchmark.goal2v6.pilot"),
            "No provider requests in ordinary Maven runs; use explicit Goal 2 v6 opt-in");
        String selected = System.getProperty("benchmark.goal2v6.fixture", "");
        assertThat(selected).as("Choose exactly one new synthetic Goal 2 case")
            .matches("G2-(?:0[1-9]|10)");
        Path root = root();
        Path dir = root.resolve(BENCHMARK);
        Path manifestFile = dir.resolve("manifest.json");
        Path reference = dir.resolve("REFERENCE.json");
        String freezeProperty = System.getProperty("benchmark.goal2v6.freeze.path", "");
        assertThat(freezeProperty).as("A previously created Goal 2 v6 freeze path is required")
            .isNotBlank();
        Path freezeFile = Path.of(freezeProperty).toAbsolutePath().normalize();
        assertThat(freezeFile.startsWith(root) && Files.isRegularFile(freezeFile)).isTrue();
        byte[] frozenBytes = Files.readAllBytes(freezeFile);
        JsonNode frozen = JSON.readTree(frozenBytes);
        assertThat(frozen.path("type").asText()).isEqualTo("GOAL2_V6_PRE_RUN_PROJECT_REFERENCE_FREEZE");
        assertThat(frozen.path("status").asText()).isEqualTo("FROZEN_PROJECT_DEFINED");
        assertThat(frozen.path("reference_method").asText())
            .isEqualTo("PROJECT_AI_ASSISTED_PDF_AND_AUTHORITY_REVIEW");
        Instant frozenAt = Instant.parse(frozen.path("frozen_at").asText());
        assertThat(frozenAt).as("The reference must precede any provider observation").isBefore(Instant.now());
        String commit = git(root, "rev-parse", "HEAD");
        assertThat(commit).isEqualTo(frozen.path("app_commit").asText());
        assertThat(git(root, "status", "--porcelain", "--untracked-files=no", "--",
            "backend/src/main/java/com/capvault/backend/aireview",
            "backend/src/main/java/com/capvault/backend/filecheck/PdfInspector.java",
            "backend/src/test/java/com/capvault/backend/aireview/StdGoal2V6LivePilotTest.java"))
            .as("Commit the live app source and runner before freezing or using an app-labeled result").isBlank();
        assertThat(frozen.path("prompt_version").asText()).isEqualTo(AiReviewService.PROMPT_VERSION);
        assertThat(frozen.path("model").asText()).isEqualTo(GeminiAiReviewProvider.MODEL);
        assertThat(frozen.path("runner_sha256").asText())
            .isEqualTo(sha(Files.readAllBytes(root.resolve(
                "backend/src/test/java/com/capvault/backend/aireview/StdGoal2V6LivePilotTest.java"))));
        byte[] manifestBytes = Files.readAllBytes(manifestFile);
        assertThat(sha(manifestBytes)).isEqualTo(frozen.path("manifest_sha256").asText());
        assertThat(sha(Files.readAllBytes(reference))).isEqualTo(frozen.path("reference_sha256").asText());
        JsonNode manifest = JSON.readTree(manifestBytes);
        JsonNode scheduled = frozen.path("case_ids");
        assertThat(scheduled.size()).as("Exactly ten planned cases are required").isEqualTo(10);
        JsonNode caseRow = null;
        for (JsonNode row : manifest.path("fixtures")) {
            if (selected.equals(row.path("fixture_id").asText())) caseRow = row;
        }
        assertThat(caseRow).as("Case must be declared in the frozen source manifest").isNotNull();
        boolean scheduledHere = false;
        for (JsonNode id : scheduled) if (selected.equals(id.asText())) scheduledHere = true;
        assertThat(scheduledHere).as("Do not add/replace a case after reference freeze").isTrue();
        Path fixture = safeRelative(dir, caseRow.path("filename").asText(), "fixtures");
        byte[] pdf = Files.readAllBytes(fixture);
        assertThat(sha(pdf)).isEqualTo(caseRow.path("sha256").asText())
            .isEqualTo(frozen.path("fixture_sha256").path(selected).asText());
        assertThat(pdf.length).as("Only compact synthetic inline PDFs, no uncontrolled upload").isLessThan(10_000_000);
        String templateFilename = manifest.path("template_filename").asText();
        Path template = safeRelative(dir, templateFilename, "fixtures");
        byte[] templateBytes = Files.readAllBytes(template);
        assertThat(sha(templateBytes)).isEqualTo(frozen.path("template_sha256").asText());
        boolean mapped = caseRow.path("template_mapped").asBoolean();
        String instructionFilename = caseRow.path("instructions_filename").asText(
            manifest.path("instructions_filename").asText());
        String instructionsKey = switch (instructionFilename) {
            case "STD_V6_INSTRUCTIONS.txt" -> "mapped";
            case "NO_TEMPLATE_GENERIC_INSTRUCTIONS.txt" -> "no_template_generic";
            case "NO_TEMPLATE_EXPLICIT_INSTRUCTIONS.txt" -> "no_template_explicit";
            default -> throw new IllegalArgumentException("Unrecognized configured synthetic STD instruction source");
        };
        assertThat(mapped).as("Mapped template must correspond to correct planned instructions")
            .isEqualTo(instructionsKey.equals("mapped"));
        assertThat(caseRow.path("expected_decisions").isArray()
            && caseRow.path("expected_decisions").size() > 0)
            .as("Source-grounded decisions must exist before sending a case to Gemini").isTrue();
        for (JsonNode decision : caseRow.path("expected_decisions")) {
            assertThat(decision.path("decision_id").asText()).isNotBlank();
            assertThat(decision.path("criterion").asText()).isNotBlank();
            assertThat(decision.path("authority_excerpt").asText()).isNotBlank();
            assertThat(decision.path("document_evidence_excerpt").asText()).isNotBlank();
            assertThat(decision.path("reference_rationale").asText()).isNotBlank();
        }
        Path instructionsFile = safeRelative(dir, instructionFilename, "");
        byte[] instructionsBytes = Files.readAllBytes(instructionsFile);
        assertThat(sha(instructionsBytes)).isEqualTo(frozen.path("instructions_sha256").path(instructionsKey).asText());
        assertThat(frozen.path("provider_cache_version").asText())
            .isEqualTo(new GeminiAiReviewProvider("not-a-key", RestClient.builder().build(), JSON, 0).cacheVersion());
        var inspector = new PdfInspector();
        var inspection = inspector.inspect(pdf);
        var templateInspection = inspector.inspect(templateBytes);
        assertThat(inspection.readable() && templateInspection.readable())
            .as("Both inputs must be valid, fictional, readable PDF documents").isTrue();
        String key = localCredential(root.resolve(".env.smart-goal-2"));
        assertThat(key).as("Ignored existing Gemini key is required for explicit live opt-in").isNotBlank();

        Path attempts = System.getProperty("benchmark.goal2v6.attempts.path", "").isBlank()
            ? root.resolve(DEFAULT_ATTEMPTS)
            : Path.of(System.getProperty("benchmark.goal2v6.attempts.path")).toAbsolutePath().normalize();
        assertThat(attempts.startsWith(root)).as("Attempt evidence must remain inside repository").isTrue();
        String freezeHash = sha(frozenBytes);
        if (Files.isDirectory(attempts)) {
            int unavailable = 0;
            int claims = 0;
            try (var folders = Files.list(attempts)) {
                for (Path folder : folders.filter(Files::isDirectory).toList()) {
                    Path previous = folder.resolve("attempt-started.json");
                    if (!Files.isRegularFile(previous)) continue;
                    claims++;
                    var claim = JSON.readTree(Files.readAllBytes(previous));
                    assertThat(claim.path("frozen_key_sha256").asText())
                        .as("Do not mix different frozen source versions in one provider cohort")
                        .isEqualTo(freezeHash);
                    Path result = folder.resolve("attempt-result.json");
                    if (Files.isRegularFile(result)) {
                        var earlier = JSON.readTree(Files.readAllBytes(result));
                        if (earlier.path("response_http_status").asInt(0) == 429
                                || earlier.path("response_http_status").asInt(0) == 503) unavailable++;
                    }
                }
            }
            assertThat(claims).as("No additional unscheduled attempts are allowed").isLessThan(10);
            assertThat(unavailable).as("Stop the cohort after two actual 429/503 availability failures; "
                + "preserve remaining unattempted cases and do not retry earlier claims").isLessThan(2);
        }
        Path destination = attempts.resolve(selected);
        Files.createDirectories(destination);
        Map<String, Object> start = new LinkedHashMap<>();
        start.put("type", "GOAL2_V6_ONE_SHOT_PROVIDER_ATTEMPT");
        start.put("fixture_id", selected);
        start.put("attempted_at", Instant.now().toString());
        start.put("frozen_key_sha256", freezeHash);
        start.put("frozen_at", frozen.path("frozen_at").asText());
        start.put("app_commit", commit);
        start.put("manifest_sha256", sha(manifestBytes));
        start.put("reference_sha256", sha(Files.readAllBytes(reference)));
        start.put("fixture_sha256", sha(pdf));
        start.put("template_sha256", sha(templateBytes));
        start.put("instructions_input_sha256", sha(instructionsBytes));
        start.put("template_mapped", mapped);
        start.put("model", GeminiAiReviewProvider.MODEL);
        start.put("prompt_version", AiReviewService.PROMPT_VERSION);
        start.put("provider_cache_version", frozen.path("provider_cache_version").asText());
        // CREATE_NEW is the non-retry claim. Even if a request later times out or
        // execution crashes, never delete this file to manufacture a fresh result.
        Files.write(destination.resolve("attempt-started.json"),
            JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(start), StandardOpenOption.CREATE_NEW);
        var capture = new Capture(key, destination);
        Map<String, Object> outcome = new LinkedHashMap<>(start);
        outcome.put("provider", "Google Gemini");
        outcome.put("scope", "Genuine provider + actual production postprocessing, synthetic PDF; no Drive/UI/cache");
        outcome.put("cache_status", "NOT_ESTABLISHED");
        outcome.put("outcome", "outcome_unknown");
        try {
            var provider = new GeminiAiReviewProvider(key,
                RestClient.builder().baseUrl("https://generativelanguage.googleapis.com")
                    .requestInterceptor(capture::intercept).build(), JSON, 0);
            var input = new AiReviewProvider.Input("goal2-v6-" + selected + "-" + commit,
                pdf, inspection.extractedText(), AiReviewService.SYSTEM_INSTRUCTION,
                "Software Test Document (STD)", new String(instructionsBytes, StandardCharsets.UTF_8),
                mapped ? templateInspection.extractedText() : "");
            var raw = provider.review(input);
            outcome.put("raw_report_sha256", writeReport(destination.resolve("raw-report.json"), raw, key));
            var finalReport = AiReviewService.postprocessForBenchmark(raw,
                input.deliverableTitle(), input.instructions(), input.templateText(), input.extractedText());
            outcome.put("production_filtered_report_sha256",
                writeReport(destination.resolve("production-filtered-report.json"), finalReport, key));
            outcome.put("outcome", "fresh_success");
            outcome.put("cache_status", "MISS");
            outcome.put("raw_findings", raw.findings().size());
            outcome.put("final_findings", finalReport.findings().size());
            outcome.put("final_missing_sections", finalReport.missingRequiredSections().size());
            assertThat(capture.generationRequests.get()).as("One and only one HTTP generation call").isEqualTo(1);
        } catch (GeminiAiReviewProvider.Failure failure) {
            outcome.put("outcome", "RATE_LIMITED".equals(failure.code) ? "quota_failure"
                : "PROVIDER_OUTCOME_UNKNOWN".equals(failure.code) || "PROVIDER_TIMEOUT".equals(failure.code)
                    || "PROVIDER_CONNECTION_FAILED".equals(failure.code) ? "outcome_unknown"
                    : "INVALID_RESPONSE".equals(failure.code) || "OUTPUT_TRUNCATED".equals(failure.code)
                        ? "invalid_response" : "provider_failure");
            outcome.put("failure_code", failure.code);
        } catch (Exception failure) {
            outcome.put("outcome", Files.exists(destination.resolve("raw-report.json"))
                ? "production_postprocessing_rejected" : "outcome_unknown");
            outcome.put("failure_code", failure.getClass().getSimpleName());
        } finally {
            outcome.put("finished_at", Instant.now().toString());
            outcome.put("generation_requests_sent", capture.generationRequests.get());
            outcome.put("response_http_status", capture.httpStatus);
            outcome.put("provider_response_id", capture.responseId);
            outcome.put("request_payload_sha256", capture.requestPayloadHash);
            if (Files.isRegularFile(destination.resolve("raw-provider-response.json")))
                outcome.put("raw_provider_sha256",
                    sha(Files.readAllBytes(destination.resolve("raw-provider-response.json"))));
            Files.write(destination.resolve("attempt-result.json"),
                JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(outcome), StandardOpenOption.CREATE_NEW);
        }
        assertThat(outcome.get("outcome")).as("Provider failures stay recorded and are never retried")
            .isEqualTo("fresh_success");
    }

    private static Path safeRelative(Path dir, String filename, String requiredSubdir) throws IOException {
        Path file = dir.resolve(filename).toAbsolutePath().normalize();
        assertThat(filename).as("No private/outside-file references").isNotBlank();
        Path permitted = requiredSubdir.isEmpty() ? dir : dir.resolve(requiredSubdir);
        assertThat(file.startsWith(permitted.toAbsolutePath().normalize()) && Files.isRegularFile(file)).isTrue();
        assertThat(file.toRealPath().startsWith(permitted.toRealPath()))
            .as("Symlink cannot substitute an unapproved PDF or input outside synthetic benchmark").isTrue();
        return file;
    }
    private static String writeReport(Path path, Object report, String credential) throws Exception {
        String content = JSON.writerWithDefaultPrettyPrinter().writeValueAsString(report);
        assertThat(content).doesNotContain(credential);
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        Files.write(path, bytes, StandardOpenOption.CREATE_NEW);
        return sha(bytes);
    }
    private static String localCredential(Path file) throws IOException {
        if (!Files.isRegularFile(file)) return "";
        return Files.readAllLines(file).stream().filter(line -> line.trim().startsWith("GEMINI_API_KEY="))
            .map(line -> line.substring(line.indexOf('=') + 1).trim().replaceAll("^[\\\"']|[\\\"']$", ""))
            .findFirst().orElse("");
    }
    private static String git(Path root, String... args) throws Exception {
        var command = new java.util.ArrayList<String>();
        command.add("git"); command.addAll(java.util.List.of(args));
        var process = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true).start();
        String stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        assertThat(process.waitFor()).as("Cannot establish Git source revision").isZero();
        return stdout;
    }
    private static Path root() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.isRegularFile(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }
    private static String sha(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
    private static final class Capture {
        final String credential;
        final Path folder;
        final AtomicInteger generationRequests = new AtomicInteger();
        Integer httpStatus;
        String responseId;
        String requestPayloadHash;
        Capture(String credential, Path folder) { this.credential = credential; this.folder = folder; }
        ClientHttpResponse intercept(org.springframework.http.HttpRequest request, byte[] bytes,
                org.springframework.http.client.ClientHttpRequestExecution execution) throws IOException {
            if (!request.getURI().getHost().equals("generativelanguage.googleapis.com")
                    || !request.getURI().getPath().endsWith(":generateContent"))
                throw new IOException("Unplanned provider endpoint blocked by bounded benchmark");
            if (generationRequests.incrementAndGet() != 1)
                throw new IOException("Second Gemini generation blocked by one-shot benchmark");
            try { requestPayloadHash = sha(bytes); }
            catch (Exception invalid) { throw new IOException("Cannot fingerprint provider request", invalid); }
            ClientHttpResponse response = execution.execute(request, bytes);
            httpStatus = response.getStatusCode().value();
            byte[] responseBytes = response.getBody().readAllBytes();
            if (httpStatus == 200) {
                String content = new String(responseBytes, StandardCharsets.UTF_8);
                if (content.contains(credential)) throw new IOException("Credential appeared in provider response");
                try { responseId = JSON.readTree(responseBytes).path("responseId").asText(null); }
                catch (Exception invalid) { responseId = null; }
                Files.write(folder.resolve("raw-provider-response.json"), responseBytes,
                    StandardOpenOption.CREATE_NEW);
            }
            return new CopiedResponse(response, responseBytes);
        }
    }
    private static final class CopiedResponse implements ClientHttpResponse {
        final ClientHttpResponse delegate;
        final byte[] bytes;
        CopiedResponse(ClientHttpResponse delegate, byte[] bytes) { this.delegate = delegate; this.bytes = bytes; }
        @Override public HttpStatusCode getStatusCode() throws IOException { return delegate.getStatusCode(); }
        @Override public String getStatusText() throws IOException { return delegate.getStatusText(); }
        @Override public HttpHeaders getHeaders() { return delegate.getHeaders(); }
        @Override public InputStream getBody() { return new ByteArrayInputStream(bytes); }
        @Override public void close() { delegate.close(); }
    }
}
