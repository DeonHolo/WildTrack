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
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import com.capvault.backend.filecheck.PdfInspector;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.client.RestClient;

/**
 * Follow-up engineering experiment on SANITIZED SRS fixtures derived from owner-provided local PDFs.
 * The owner's original documents must never be uploaded or included in the evidence package.
 * No live call runs unless both opt-in properties are explicitly supplied and the reference is frozen.
 */
class SrsAiReviewLivePilotTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Path RELATIVE = Path.of("docs/capstone-2-build/benchmarks/srs");
    private static final Path SCRATCH = Path.of(".scratch/capstone-2-session/srs-followup");
    private static final Map<String, String> FIXTURES = Map.of(
        "SRS-01", "SRS-01_template-only.pdf",
        "SRS-02", "SRS-02_completed.pdf",
        "SRS-03", "SRS-03_partially-complete.pdf",
        "SRS-04", "SRS-04_toc-only-heading.pdf",
        "SRS-05", "SRS-05_section-missing.pdf",
        "SRS-06", "SRS-06_bogus-requirement.pdf");

    @Test
    void runSelectedSanitizedSrsOnceThroughProviderAndProductionGrounding() throws Exception {
        Assumptions.assumeTrue(Boolean.getBoolean("benchmark.srs.pilot"),
            "SRS live provider requests require explicit opt-in; regular test runs are offline");
        String id = System.getProperty("benchmark.srs.fixture", "");
        assertThat(id).as("Choose exactly one of the six sanitized fixture IDs").isIn(FIXTURES.keySet());
        Path root = root();
        Path dir = root.resolve(RELATIVE);
        Path freeze = root.resolve(SCRATCH).resolve("frozen-key.json");
        assertThat(Files.isRegularFile(freeze)).as("Freeze the declared source expectations BEFORE provider calls").isTrue();
        var frozen = JSON.readTree(Files.readAllBytes(freeze));
        Instant frozenAt = Instant.parse(frozen.path("frozen_at").asText());
        assertThat(frozenAt).isBefore(Instant.now());
        String commit = git(root, "rev-parse", "HEAD");
        assertThat(commit).as("Do not silently change the production code after reference freeze")
            .isEqualTo(frozen.path("app_commit").asText());
        assertThat(git(root, "status", "--porcelain", "--untracked-files=no", "--",
            "backend/src/main/java/com/capvault/backend/aireview"))
            .as("Commit production provider/post-processing before capturing a revision-labeled run").isBlank();
        Path reference = dir.resolve("SOURCE_PROOF.md");
        Path manifest = dir.resolve("manifest.json");
        Path instructionsFile = dir.resolve("SRS_AI_INSTRUCTIONS.txt");
        Path template = dir.resolve("fixtures/SRS-01_template-only.pdf");
        for (var input : Map.of("reference_sha256", reference,
            "manifest_sha256", manifest, "instructions_sha256", instructionsFile,
            "template_sha256", template).entrySet()) {
            assertThat(hash(Files.readAllBytes(input.getValue()))).as("Frozen input changed: " + input.getKey())
                .isEqualTo(frozen.path(input.getKey()).asText());
        }
        Path fixture = dir.resolve("fixtures").resolve(FIXTURES.get(id));
        assertThat(fixture.toAbsolutePath().normalize().startsWith(dir.resolve("fixtures").toAbsolutePath()))
            .as("Never send owner's original PDFs to provider").isTrue();
        byte[] pdf = Files.readAllBytes(fixture);
        assertThat(hash(pdf)).as("Fixture bytes differ from pre-run expected input")
            .isEqualTo(frozen.path("fixture_sha256").path(id).asText());
        var planned = JSON.readTree(Files.readAllBytes(manifest));
        boolean documented = false;
        for (var row : planned.path("fixtures")) {
            if (id.equals(row.path("fixture_id").asText())) {
                assertThat(row.path("filename").asText()).isEqualTo(FIXTURES.get(id));
                assertThat(row.path("sha256").asText()).isEqualTo(hash(pdf));
                assertThat(row.path("expected_observation").asText()).isNotBlank();
                documented = true;
            }
        }
        assertThat(documented).as("Each source-safe case must have a predeclared expected observation").isTrue();
        var inspector = new PdfInspector();
        var doc = inspector.inspect(pdf);
        var mapped = inspector.inspect(Files.readAllBytes(template));
        assertThat(doc.readable() && mapped.readable()).isTrue();
        String instructions = Files.readString(instructionsFile);
        String key = readLocalCredential(root.resolve(".env.smart-goal-2"));
        assertThat(key).as("Ignored local Gemini credential must be configured").isNotBlank();

        Path attemptDir = root.resolve(SCRATCH).resolve("attempts").resolve(id);
        Files.createDirectories(attemptDir);
        Map<String, Object> claim = new LinkedHashMap<>();
        claim.put("type", "SRS_SEPARATE_FOLLOWUP_ONE_SHOT_ATTEMPT");
        claim.put("fixture_id", id);
        claim.put("attempted_at", Instant.now().toString());
        claim.put("frozen_at", frozen.path("frozen_at").asText());
        claim.put("app_commit", commit);
        claim.put("fixture_sha256", hash(pdf));
        claim.put("template_sha256", hash(Files.readAllBytes(template)));
        claim.put("reference_sha256", hash(Files.readAllBytes(reference)));
        claim.put("prompt_version", AiReviewService.PROMPT_VERSION);
        // Durable exclusive claim BEFORE construction of provider or transmission; never retry after a crash.
        Files.write(attemptDir.resolve("attempt-started.json"),
            JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(claim), StandardOpenOption.CREATE_NEW);
        var capture = new Capture(key, attemptDir);
        Map<String, Object> outcome = new LinkedHashMap<>(claim);
        outcome.put("model", GeminiAiReviewProvider.MODEL);
        outcome.put("provider", "Google Gemini");
        outcome.put("scope", "Actual provider + production post-processing on sanitized derived SRS; not original real SRS");
        outcome.put("outcome", "outcome_unknown");
        try {
            var provider = new GeminiAiReviewProvider(key,
                RestClient.builder().baseUrl("https://generativelanguage.googleapis.com")
                    .requestInterceptor(capture::intercept).build(), JSON, 0);
            outcome.put("provider_cache_version", provider.cacheVersion());
            var input = new AiReviewProvider.Input("srs-followup-" + id + "-" + commit,
                pdf, doc.extractedText(), AiReviewService.SYSTEM_INSTRUCTION,
                "Software Requirements Specification (SRS)", instructions, mapped.extractedText());
            var raw = provider.review(input);
            // Preserve the actual parsed provider result BEFORE postprocessing: a legitimate
            // production rejection must not erase evidence that Gemini returned a response.
            outcome.put("raw_report_sha256", writeSafely(attemptDir.resolve("raw-report.json"), raw, key));
            var filtered = AiReviewService.postprocessForBenchmark(raw,
                input.deliverableTitle(), input.instructions(), input.templateText(), input.extractedText());
            outcome.put("outcome", "fresh_success");
            outcome.put("production_filtered_report_sha256",
                writeSafely(attemptDir.resolve("production-filtered-report.json"), filtered, key));
            outcome.put("raw_findings", raw.findings().size());
            outcome.put("filtered_findings", filtered.findings().size());
            outcome.put("raw_missing_sections", raw.missingRequiredSections().size());
            outcome.put("filtered_missing_sections", filtered.missingRequiredSections().size());
            assertThat(capture.generationRequests.get()).as("Exactly one real Gemini generation per fixture").isEqualTo(1);
        } catch (GeminiAiReviewProvider.Failure failure) {
            outcome.put("outcome", "RATE_LIMITED".equals(failure.code) ? "quota_failure"
                : "PROVIDER_OUTCOME_UNKNOWN".equals(failure.code) ? "outcome_unknown" : "provider_failure");
            outcome.put("reason", failure.code); // Never log provider error body, credential, or PDF content.
        } catch (Exception failure) {
            outcome.put("outcome", Files.exists(attemptDir.resolve("raw-report.json"))
                ? "production_postprocessing_rejected" : "outcome_unknown");
            outcome.put("reason", "Provider or production post-processing failed; no retry; type="
                + failure.getClass().getSimpleName());
        } finally {
            outcome.put("finished_at", Instant.now().toString());
            outcome.put("generation_requests_sent", capture.generationRequests.get());
            outcome.put("response_http_status", capture.httpStatus);
            outcome.put("provider_response_id", capture.responseId);
            if (Files.isRegularFile(attemptDir.resolve("raw-provider-response.json"))) {
                outcome.put("raw_provider_sha256",
                    hash(Files.readAllBytes(attemptDir.resolve("raw-provider-response.json"))));
            }
            Files.write(attemptDir.resolve("attempt-result.json"),
                JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(outcome), StandardOpenOption.CREATE_NEW);
        }
        assertThat(outcome.get("outcome")).as("The attempted case remains recorded even if Gemini failed")
            .isEqualTo("fresh_success");
    }

    private static String writeSafely(Path file, Object report, String credential) throws Exception {
        String value = JSON.writerWithDefaultPrettyPrinter().writeValueAsString(report);
        assertThat(value).as("Never persist provider output that echoes the Gemini credential")
            .doesNotContain(credential);
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        Files.write(file, bytes, StandardOpenOption.CREATE_NEW);
        return hash(bytes);
    }
    private static String readLocalCredential(Path file) throws IOException {
        if (!Files.isRegularFile(file)) return "";
        return Files.readAllLines(file).stream().filter(line -> line.trim().startsWith("GEMINI_API_KEY="))
            .map(line -> line.substring(line.indexOf('=') + 1).trim().replaceAll("^[\\\"']|[\\\"']$", ""))
            .findFirst().orElse("");
    }
    private static String git(Path root, String... args) throws Exception {
        var command = new java.util.ArrayList<String>();
        command.add("git"); command.addAll(java.util.List.of(args));
        var process = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        assertThat(process.waitFor()).as("Cannot establish Git identity").isZero();
        return output;
    }
    private static String hash(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }
    private static Path root() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.isRegularFile(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }
    private static final class Capture {
        final String credential;
        final Path folder;
        final AtomicInteger generationRequests = new AtomicInteger();
        Integer httpStatus;
        String responseId;
        Capture(String credential, Path folder) { this.credential = credential; this.folder = folder; }
        ClientHttpResponse intercept(org.springframework.http.HttpRequest request, byte[] requestBytes,
                org.springframework.http.client.ClientHttpRequestExecution execution) throws IOException {
            if (!request.getURI().getPath().endsWith(":generateContent")) {
                throw new IOException("Unexpected provider endpoint; refuse extra upload on controlled SRS fixture");
            }
            if (generationRequests.incrementAndGet() != 1) {
                throw new IOException("Refuse more than one generation request");
            }
            ClientHttpResponse response = execution.execute(request, requestBytes);
            httpStatus = response.getStatusCode().value();
            byte[] bytes = response.getBody().readAllBytes();
            if (httpStatus == 200) {
                String json = new String(bytes, StandardCharsets.UTF_8);
                if (json.contains(credential)) throw new IOException("Credential echoed by provider; not persisted");
                try { responseId = JSON.readTree(bytes).path("responseId").asText(null); }
                catch (Exception invalid) { responseId = null; }
                Files.write(folder.resolve("raw-provider-response.json"), bytes, StandardOpenOption.CREATE_NEW);
            }
            return new CopiedResponse(response, bytes);
        }
    }
    private static final class CopiedResponse implements ClientHttpResponse {
        final ClientHttpResponse delegate; final byte[] body;
        CopiedResponse(ClientHttpResponse delegate, byte[] body) { this.delegate = delegate; this.body = body; }
        @Override public HttpStatusCode getStatusCode() throws IOException { return delegate.getStatusCode(); }
        @Override public String getStatusText() throws IOException { return delegate.getStatusText(); }
        @Override public HttpHeaders getHeaders() { return delegate.getHeaders(); }
        @Override public InputStream getBody() { return new ByteArrayInputStream(body); }
        @Override public void close() { delegate.close(); }
    }
}
