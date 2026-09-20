package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

import com.capvault.backend.filecheck.PdfInspector;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Opt-in, one-shot, per-ID official Goal 2 provider runner.
 *
 * NO provider call occurs during ordinary tests. Require all of:
 * -Dbenchmark.ai.pilot=true
 * -Dbenchmark.ai.pilot.fixture=STD-01 (one of the frozen ten)
 * a project-defined pre-run .scratch/capstone-2-session/goal2/frozen-key.json.
 *
 * A claim is atomically created BEFORE the first provider call. A crash leaves the claim
 * reserved, including if the provider outcome is unknowable; never retry that fixture.
 */
class StdAiPilotRunTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Path BENCHMARK = Path.of("docs/capstone-2-build/benchmarks/std");
    private static final Path SCRATCH = Path.of(".scratch/capstone-2-session/goal2");
    private static final String FREEZE_FILE = "frozen-key.json";
    private static final Set<String> PILOT = Set.of(
        "STD-01", "STD-02", "STD-03", "STD-05", "STD-08",
        "STD-09", "STD-10", "STD-12", "STD-18", "STD-21");
    private static final Map<String, String> FILES = Map.of(
        "STD-01", "docs/STD TEMPLATE.pdf",
        "STD-02", "docs/capstone-2-build/benchmarks/std/fixtures/STD-02_personalized-template-like.pdf",
        "STD-03", "docs/capstone-2-build/benchmarks/std/fixtures/STD-03_one-section-complete.pdf",
        "STD-05", "docs/capstone-2-build/benchmarks/std/fixtures/STD-05_meaningful-complete.pdf",
        "STD-08", "docs/capstone-2-build/benchmarks/std/fixtures/STD-08_repeated-filler.pdf",
        "STD-09", "docs/capstone-2-build/benchmarks/std/fixtures/STD-09_varied-irrelevant.pdf",
        "STD-10", "docs/capstone-2-build/benchmarks/std/fixtures/STD-10_wrong-document.pdf",
        "STD-12", "docs/capstone-2-build/benchmarks/std/fixtures/STD-12_missing-test-approach.pdf",
        "STD-18", "docs/capstone-2-build/benchmarks/std/fixtures/STD-18_incomplete-no-template.pdf",
        "STD-21", "docs/capstone-2-build/benchmarks/std/fixtures/STD-21_missing-execution-evidence.pdf");
    private static final String NO_TEMPLATE_INSTRUCTIONS =
        "Review this submitted Software Test Document and report observations supported by the PDF. "
        + "No official template is supplied.";

    private record Prepared(String id, byte[] pdf, String extractedText, String templateText, String fixtureHash,
            String templateHash, String freezeSha, String frozenAt, String manifestHash, String checklistHash,
            String referenceProtocolHash, String instructions, String appCommit, String providerCacheVersion) { }

    @Test
    void runSelectedOfficialFixture() throws Exception {
        Assumptions.assumeTrue(Boolean.getBoolean("benchmark.ai.pilot"),
            "No official pilot provider request without explicit opt-in and a completed freeze");
        String id = System.getProperty("benchmark.ai.pilot.fixture", "");
        assertThat(id).as("Select precisely one whitelisted official pilot fixture").isIn(PILOT);
        Path repo = repositoryRoot();
        Prepared prepared = prepare(repo, id);
        String key = readKey(repo.resolve(".env.smart-goal-2"));
        assertThat(key).as("Missing GEMINI_API_KEY in ignored credential file").isNotBlank();

        Path evidenceDir = repo.resolve(SCRATCH).resolve("official-ten").resolve(id);
        // Constructor and network I/O happen only AFTER the durable attempt claim.
        ProviderEvidence capture = new ProviderEvidence(evidenceDir, key);
        runAttempt(evidenceDir, prepared, () -> new GeminiAiReviewProvider(key,
            RestClient.builder().baseUrl("https://generativelanguage.googleapis.com")
                .requestInterceptor(capture::intercept).build(), JSON, 0), capture);

        JsonNode summary = JSON.readTree(Files.readString(evidenceDir.resolve("run-record.json")));
        assertThat(summary.path("outcome").asText()).as("Official fixture attempt recorded for project reference audit")
            .isEqualTo("fresh_success");
    }

    private static Prepared prepare(Path root, String id) throws Exception {
        Path frozenPath = root.resolve(SCRATCH).resolve(FREEZE_FILE);
        assertThat(Files.isRegularFile(frozenPath)).as("Owner must freeze the key before any official provider call")
            .isTrue();
        byte[] frozenBytes = Files.readAllBytes(frozenPath);
        JsonNode freeze = JSON.readTree(frozenBytes);
        assertThat(freeze.path("status").asText()).isEqualTo("FROZEN");
        Instant frozenAt = Instant.parse(required(freeze, "frozen_at"));
        assertThat(frozenAt).isBefore(Instant.now());
        String revision = git(root, "rev-parse", "HEAD");
        assertThat(revision).isEqualToIgnoringCase(required(freeze, "app_commit"));
        assertThat(revision).matches("[0-9a-fA-F]{40}");
        assertThat(git(root, "status", "--porcelain", "--untracked-files=no", "--",
            "backend/src/main/java/com/capvault/backend/aireview",
            "backend/src/main/java/com/capvault/backend/filecheck/PdfInspector.java"))
            .as("Commit production provider/prompt/PDF inspector before capturing SHA-labeled pilot evidence")
            .isBlank();

        Path manifest = root.resolve(BENCHMARK).resolve("manifest.csv");
        Path checklist = root.resolve(BENCHMARK).resolve("ai-checklist.csv");
        Path template = root.resolve("docs/STD TEMPLATE.pdf");
        Path hashList = root.resolve(BENCHMARK).resolve("fixture-hashes.sha256");
        assertThat(required(freeze, "methodology")).isEqualTo("PROJECT_DEFINED_REFERENCE_AI_ASSISTED");
        assertThat(required(freeze, "model")).isEqualTo(GeminiAiReviewProvider.MODEL);
        assertThat(required(freeze, "prompt_version")).isEqualTo(AiReviewService.PROMPT_VERSION);
        Path referenceProtocol = root.resolve(BENCHMARK).resolve("GOAL2_REFERENCE_CHECKLIST.md");
        Path instructionsSource = root.resolve(BENCHMARK).resolve("STD_AI_INSTRUCTIONS.txt");
        matchFrozen(manifest, required(freeze, "manifest_sha256"), frozenAt);
        matchFrozen(checklist, required(freeze, "checklist_sha256"), frozenAt);
        matchFrozen(template, required(freeze, "template_sha256"), frozenAt);
        matchFrozen(hashList, required(freeze, "fixture_hashes_sha256"), frozenAt);
        matchFrozen(referenceProtocol, required(freeze, "protocol_sha256"), frozenAt);
        matchFrozen(instructionsSource, required(freeze, "instructions_sha256"), frozenAt);

        String file = FILES.get(id);
        assertThat(Files.readAllLines(manifest)).as("Fixture must have exactly one manifest row for its prescribed file")
            .filteredOn(line -> line.startsWith(id + "," + (id.equals("STD-01")
                ? "../../../STD TEMPLATE.pdf" : file.substring(file.indexOf("fixtures/")) + ",")))
            .hasSize(1);
        Path fixture = root.resolve(file);
        byte[] pdf = Files.readAllBytes(fixture);
        String fixtureHash = sha256(pdf);
        assertThat(Files.readAllLines(hashList)).filteredOn(line -> line.equals(fixtureHash + "  " + file))
            .as("Exact fixture must match the hash frozen in fixture-hashes.sha256").hasSize(1);
        var inspector = new PdfInspector();
        var inspected = inspector.inspect(pdf);
        var reference = inspector.inspect(Files.readAllBytes(template));
        assertThat(inspected.readable() && reference.readable()).as("Official pilot inputs must be readable PDFs").isTrue();

        Path officialTen = root.resolve(SCRATCH).resolve("official-ten");
        if (Files.isDirectory(officialTen)) {
            try (var folders = Files.list(officialTen)) {
                for (Path folder : folders.filter(Files::isDirectory).toList()) {
                    Path claim = folder.resolve("attempt-started.json");
                    if (Files.exists(claim)) {
                        JsonNode prior = JSON.readTree(Files.readString(claim));
                        assertThat(prior.path("frozen_key_sha256").asText())
                            .as("Every fixture in the pilot must share one immutable frozen key").isEqualTo(sha256(frozenBytes));
                        assertThat(prior.path("app_commit").asText()).isEqualTo(revision);
                    }
                }
            }
        }
        return new Prepared(id, pdf, inspected.extractedText(),
            id.equals("STD-18") ? "" : reference.extractedText(), fixtureHash,
            sha256(Files.readAllBytes(template)), sha256(frozenBytes), frozenAt.toString(),
            sha256(Files.readAllBytes(manifest)), sha256(Files.readAllBytes(checklist)),
            sha256(Files.readAllBytes(referenceProtocol)),
            id.equals("STD-18") ? NO_TEMPLATE_INSTRUCTIONS : Files.readString(instructionsSource),
            revision,
            new GeminiAiReviewProvider("not-a-credential", RestClient.builder().build(), JSON, 0).cacheVersion());
    }

    private static void runAttempt(Path directory, Prepared input, Supplier<AiReviewProvider> providerFactory,
            ProviderEvidence capture) throws Exception {
        Files.createDirectories(directory);
        Map<String, Object> claim = new LinkedHashMap<>();
        claim.put("type", "OFFICIAL_GOAL_2_FIRST_ATTEMPT_CLAIM");
        claim.put("fixture_id", input.id);
        claim.put("attempted_at", Instant.now().toString());
        claim.put("fixture_sha256", input.fixtureHash);
        claim.put("template_sha256", input.templateHash);
        claim.put("frozen_key_sha256", input.freezeSha);
        claim.put("frozen_at", input.frozenAt);
        claim.put("methodology", "PROJECT_DEFINED_REFERENCE_AI_ASSISTED");
        claim.put("protocol_sha256", input.referenceProtocolHash);
        claim.put("manifest_sha256", input.manifestHash);
        claim.put("checklist_sha256", input.checklistHash);
        claim.put("app_commit", input.appCommit);
        claim.put("prompt_version", AiReviewService.PROMPT_VERSION);
        claim.put("provider_cache_version", input.providerCacheVersion);
        claim.put("runner_source_sha256", runnerSourceHash());
        writeNew(directory.resolve("attempt-started.json"), JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(claim));

        Map<String, Object> result = new LinkedHashMap<>(claim);
        result.put("provider", "Google Gemini");
        result.put("model", GeminiAiReviewProvider.MODEL);
        result.put("system_instruction_sha256", sha256(AiReviewService.SYSTEM_INSTRUCTION.getBytes(StandardCharsets.UTF_8)));
        result.put("instructions_input_sha256", sha256(input.instructions.getBytes(StandardCharsets.UTF_8)));
        result.put("mapped_template", !input.templateText.isBlank());
        result.put("template_text_sha256", sha256(input.templateText.getBytes(StandardCharsets.UTF_8)));
        result.put("freshness_basis", "Direct GeminiAiReviewProvider invocation; WildTrack application cache not invoked");
        result.put("cache_status", null);
        result.put("provider_request_id", null);
        result.put("outcome", "outcome_unknown");
        try {
            var provider = providerFactory.get();
            assertThat(provider.isConfigured()).isTrue();
            assertThat(provider.cacheVersion()).isEqualTo(input.providerCacheVersion);
            var request = new AiReviewProvider.Input("goal2-" + input.id + "-" + input.freezeSha,
                input.pdf, input.extractedText, AiReviewService.SYSTEM_INSTRUCTION,
                "Software Test Document (STD)", input.instructions, input.templateText);
            var report = provider.review(request); // once only, no retries or paid fallback
            if (provider instanceof GeminiAiReviewProvider) {
                assertThat(capture.generateCalls).as("A fresh report must come from one actual generation request")
                    .hasValue(1);
                assertThat(capture.rawPath).as("A fresh report must preserve the actual HTTP provider response")
                    .isNotNull();
            }
            byte[] normalized = JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(report);
            String reportString = new String(normalized, StandardCharsets.UTF_8);
            boolean reportRedacted = reportString.contains(capture.secret);
            if (reportRedacted) {
                normalized = reportString.replace(capture.secret, "[REDACTED_API_KEY]").getBytes(StandardCharsets.UTF_8);
            }
            writeNew(directory.resolve("provider-result.json"), normalized);
            result.put("outcome", "fresh_success");
            result.put("cache_status", "MISS"); // directly sent generation request; application cache bypassed
            result.put("report_path", "provider-result.json");
            result.put("report_sha256", sha256(normalized));
            result.put("report_redacted", reportRedacted);
            result.put("raw_provider_payload_path", capture.rawPath);
            result.put("raw_provider_payload_sha256", capture.rawPayloadSha256);
            result.put("raw_provider_payload_exact", capture.rawPayloadExact);
            result.put("raw_provider_saved_sha256", capture.savedPayloadSha256);
        } catch (GeminiAiReviewProvider.Failure failure) {
            result.put("outcome", "RATE_LIMITED".equals(failure.code) ? "quota_failure"
                : "INVALID_RESPONSE".equals(failure.code) || "OUTPUT_TRUNCATED".equals(failure.code)
                ? "invalid_response"
                : "PROVIDER_TIMEOUT".equals(failure.code) || "PROVIDER_CONNECTION_FAILED".equals(failure.code)
                ? "transport_failure"
                : "PROVIDER_OUTCOME_UNKNOWN".equals(failure.code) ? "outcome_unknown"
                : "provider_failure");
            result.put("failure_code", failure.code); // never write Google error body
            result.put("reason", failure.code);
        } catch (Exception failure) {
            result.put("outcome", "outcome_unknown");
            result.put("failure_type", failure.getClass().getSimpleName()); // exception text may contain key
            result.put("reason", "Unexpected exception; remote provider outcome may be unknown");
        } finally {
            result.put("finished_at", Instant.now().toString());
            result.put("generation_requests_sent", capture.generateCalls.get());
            result.put("request_payload_sha256", capture.requestPayloadSha256);
            result.put("response_http_status", capture.httpStatus);
            result.put("provider_request_id", capture.providerRequestId);
            result.put("raw_provider_payload_sha256", capture.rawPayloadSha256);
            result.put("raw_provider_payload_path", capture.rawPath);
            result.put("raw_provider_payload_exact", capture.rawPayloadExact);
            result.put("raw_response_path", capture.rawPath);
            result.put("raw_response_sha256", capture.savedPayloadSha256);
            byte[] summary = JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(result);
            writeNew(directory.resolve("run-record.json"), summary);
            writeNew(directory.resolve("run-record.sha256"),
                (sha256(summary) + "  run-record.json\n").getBytes(StandardCharsets.UTF_8));
            Path attempts = directory.getParent().getFileName().toString().equals("official-ten")
                ? directory.getParent().getParent().resolve("attempts")
                : directory.getParent().resolve("attempts");
            Files.createDirectories(attempts);
            Map<String, Object> external = new LinkedHashMap<>();
            external.put("fixture_id", input.id);
            external.put("outcome", result.get("outcome"));
            external.put("attempted_at", claim.get("attempted_at"));
            external.put("finished_at", result.get("finished_at"));
            external.put("fixture_sha256", input.fixtureHash);
            external.put("template_sha256", input.templateHash);
            external.put("app_commit", input.appCommit);
            external.put("methodology", "PROJECT_DEFINED_REFERENCE_AI_ASSISTED");
            external.put("protocol_sha256", input.referenceProtocolHash);
            external.put("instructions_input_sha256", result.get("instructions_input_sha256"));
            external.put("frozen_key_sha256", input.freezeSha);
            external.put("frozen_at", input.frozenAt);
            external.put("manifest_sha256", input.manifestHash);
            external.put("checklist_sha256", input.checklistHash);
            external.put("provider", "Google Gemini");
            external.put("model", GeminiAiReviewProvider.MODEL);
            external.put("prompt_version", AiReviewService.PROMPT_VERSION);
            external.put("provider_cache_version", input.providerCacheVersion);
            external.put("cache_status", result.get("cache_status"));
            external.put("raw_response_path", capture.rawPath == null ? null
                : directory.resolve(capture.rawPath).toString());
            external.put("raw_response_sha256", capture.savedPayloadSha256);
            external.put("raw_response_exact", capture.rawPayloadExact);
            external.put("raw_response_unmodified_sha256", capture.rawPayloadSha256);
            external.put("report_path", result.get("report_path") == null ? null
                : directory.resolve((String) result.get("report_path")).toString());
            external.put("report_sha256", result.get("report_sha256"));
            external.put("report_redacted", result.get("report_redacted"));
            external.put("provider_request_id", capture.providerRequestId);
            external.put("generation_requests_sent", capture.generateCalls.get());
            external.put("request_payload_sha256", capture.requestPayloadSha256);
            external.put("response_http_status", capture.httpStatus);
            external.put("runner_source_sha256", claim.get("runner_source_sha256"));
            external.put("reason", result.get("reason"));
            external.put("failure_code", result.get("failure_code"));
            byte[] summaryBytes = JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(external);
            writeNew(attempts.resolve(input.id + ".json"), summaryBytes);
            writeNew(attempts.resolve(input.id + ".json.sha256"),
                (sha256(summaryBytes) + "  " + input.id + ".json\n").getBytes(StandardCharsets.UTF_8));
        }
    }

    private static final class ProviderEvidence {
        final Path directory;
        final String secret;
        final AtomicInteger generateCalls = new AtomicInteger();
        String requestPayloadSha256;
        String rawPayloadSha256;
        String savedPayloadSha256;
        String rawPath;
        Boolean rawPayloadExact;
        String providerRequestId;
        Integer httpStatus;

        ProviderEvidence(Path directory, String secret) { this.directory = directory; this.secret = secret; }

        ClientHttpResponse intercept(org.springframework.http.HttpRequest request, byte[] requestBody,
                org.springframework.http.client.ClientHttpRequestExecution execution) throws IOException {
            if (!request.getURI().toString().matches(
                "https://generativelanguage\\.googleapis\\.com/v1beta/models/[a-zA-Z0-9._-]+:generateContent")) {
                throw new IOException("Unexpected provider endpoint");
            }
            if (generateCalls.incrementAndGet() != 1) throw new IOException("Multiple generation requests prohibited");
            requestPayloadSha256 = sha256(requestBody);
            ClientHttpResponse response = execution.execute(request, requestBody);
            httpStatus = response.getStatusCode().value();
            providerRequestId = response.getHeaders().getFirst("x-request-id");
            if (providerRequestId == null) providerRequestId = response.getHeaders().getFirst("x-goog-request-id");
            byte[] body = response.getBody().readAllBytes();
            rawPayloadSha256 = sha256(body);
            if (response.getStatusCode().is2xxSuccessful()) {
                // Google returns the structured model payload, never the API key in headers.
                // If the model nonetheless echoes the secret, the saved payload is redacted and marked non-exact.
                String text = new String(body, StandardCharsets.UTF_8);
                rawPayloadExact = !text.contains(secret);
                byte[] saved = (rawPayloadExact ? text : text.replace(secret, "[REDACTED_API_KEY]"))
                    .getBytes(StandardCharsets.UTF_8);
                rawPath = "provider-response.raw.json";
                savedPayloadSha256 = sha256(saved);
                writeNew(directory.resolve(rawPath), saved);
            }
            return new CapturedResponse(response, body);
        }
    }

    private static final class CapturedResponse implements ClientHttpResponse {
        private final ClientHttpResponse delegate;
        private final byte[] body;
        CapturedResponse(ClientHttpResponse delegate, byte[] body) { this.delegate = delegate; this.body = body; }
        @Override public HttpStatusCode getStatusCode() throws IOException { return delegate.getStatusCode(); }
        @Override public String getStatusText() throws IOException { return delegate.getStatusText(); }
        @Override public HttpHeaders getHeaders() { return delegate.getHeaders(); }
        @Override public InputStream getBody() { return new ByteArrayInputStream(body); }
        @Override public void close() { delegate.close(); }
    }

    private static void matchFrozen(Path path, String expected, Instant frozenAt) throws IOException {
        assertThat(expected).matches("[0-9a-f]{64}");
        assertThat(sha256(Files.readAllBytes(path))).as("Frozen file changed: " + path.getFileName()).isEqualTo(expected);
        assertThat(Files.getLastModifiedTime(path).toInstant()).as("File modified after freeze: " + path.getFileName())
            .isBeforeOrEqualTo(frozenAt);
    }

    private static String readKey(Path file) throws IOException {
        assertThat(Files.isRegularFile(file)).as("Missing ignored .env.smart-goal-2").isTrue();
        List<String> entries = Files.readAllLines(file);
        String key = "";
        for (String line : entries) {
            if (line.trim().startsWith("GEMINI_API_KEY=")) {
                assertThat(key).as("Only one credential entry is allowed").isBlank();
                key = line.substring(line.indexOf('=') + 1).trim().replaceAll("^[\\\"']|[\\\"']$", "");
            }
        }
        return key;
    }

    private static String required(JsonNode node, String field) {
        assertThat(node.path(field).isTextual()).as("Freeze key missing: " + field).isTrue();
        return node.path(field).asText();
    }

    private static String runnerSourceHash() {
        Path source = repositoryRoot().resolve("backend/src/test/java/com/capvault/backend/aireview/StdAiPilotRunTest.java");
        try {
            return Files.exists(source) ? sha256(Files.readAllBytes(source)) : "unavailable";
        } catch (IOException error) {
            throw new IllegalStateException("Cannot fingerprint runner source");
        }
    }

    private static void writeNew(Path file, byte[] content) throws IOException {
        Files.write(file, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    private static String git(Path root, String... arguments) throws Exception {
        var command = new java.util.ArrayList<>(List.of("git"));
        command.addAll(Arrays.asList(arguments));
        Process process = new ProcessBuilder(command).directory(root.toFile()).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        assertThat(process.waitFor()).as("Git identity check failed").isZero();
        return output;
    }

    private static Path repositoryRoot() {
        Path cwd = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.exists(cwd.resolve("backend/pom.xml")) ? cwd : cwd.getParent();
    }

    @Test
    void mockProviderMakesExactlyOneCallAndRefusesASecondAttempt(@TempDir Path tmp) throws Exception {
        AtomicInteger calls = new AtomicInteger();
        var mock = new AiReviewProvider() {
            @Override public boolean isConfigured() { return true; }
            @Override public String cacheVersion() { return "mock-v1"; }
            @Override public Result review(Input input) {
                calls.incrementAndGet();
                assertThat(input.systemInstruction()).isEqualTo(AiReviewService.SYSTEM_INSTRUCTION);
                assertThat(input.templateText()).isBlank(); // STD-18 branch
                return new Result("Mocked report with test-key", List.of(), List.of(), List.of(), "Mocked action");
            }
        };
        Prepared input = mockPrepared("STD-18", "mock-v1");
        runAttempt(tmp.resolve("STD-18"), input, () -> mock, new ProviderEvidence(tmp.resolve("STD-18"), "test-key"));
        assertThat(calls).hasValue(1);
        assertThatThrownBy(() -> runAttempt(tmp.resolve("STD-18"), input,
            () -> mock, new ProviderEvidence(tmp.resolve("STD-18"), "test-key")))
            .isInstanceOf(FileAlreadyExistsException.class);
        assertThat(calls).hasValue(1);
        assertThat(JSON.readTree(Files.readString(tmp.resolve("STD-18/run-record.json")))
            .path("outcome").asText()).isEqualTo("fresh_success");
        assertThat(Files.readString(tmp.resolve("STD-18/provider-result.json")))
            .doesNotContain("test-key").contains("[REDACTED_API_KEY]");
        assertThat(JSON.readTree(Files.readString(tmp.resolve("attempts/STD-18.json")))
            .path("report_sha256").asText()).matches("[0-9a-f]{64}");
    }

    @Test
    void mockProviderFailurePreservesClaimAndNeverRetries(@TempDir Path tmp) throws Exception {
        AtomicInteger calls = new AtomicInteger();
        var mock = new AiReviewProvider() {
            @Override public boolean isConfigured() { return true; }
            @Override public String cacheVersion() { return "mock-v1"; }
            @Override public Result review(Input input) {
                calls.incrementAndGet();
                throw new GeminiAiReviewProvider.Failure("RATE_LIMITED");
            }
        };
        Path dir = tmp.resolve("STD-01");
        Prepared input = mockPrepared("STD-01", "mock-v1");
        runAttempt(dir, input, () -> mock, new ProviderEvidence(dir, "test-key"));
        assertThat(calls).hasValue(1);
        assertThat(JSON.readTree(Files.readString(dir.resolve("run-record.json")))
            .path("outcome").asText()).isEqualTo("quota_failure");
        assertThatThrownBy(() -> runAttempt(dir, input, () -> mock, new ProviderEvidence(dir, "test-key")))
            .isInstanceOf(FileAlreadyExistsException.class);
        assertThat(calls).hasValue(1);
    }

    @Test
    void freezeHashMismatchFailsBeforeAnyProviderCall(@TempDir Path tmp) throws Exception {
        Path fixture = tmp.resolve("fixture");
        Files.writeString(fixture, "frozen version");
        String digest = sha256(Files.readAllBytes(fixture));
        Instant frozenAt = Instant.now().plusSeconds(1);
        matchFrozen(fixture, digest, frozenAt);
        assertThatThrownBy(() -> matchFrozen(fixture, "0".repeat(64), frozenAt))
            .isInstanceOf(AssertionError.class);
    }

    @Test
    void capturesRawHttpResponseOnceAndRedactsEchoedCredential(@TempDir Path tmp) throws Exception {
        Path evidence = tmp.resolve("evidence");
        Files.createDirectories(evidence);
        ProviderEvidence captured = new ProviderEvidence(evidence, "test-key");
        RestClient.Builder builder = RestClient.builder().baseUrl("https://generativelanguage.googleapis.com")
            .requestInterceptor(captured::intercept);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        String report = JSON.writeValueAsString(Map.of(
            "summary", "Contains echoed test-key; it must be redacted at rest.",
            "findings", List.of(), "missingRequiredSections", List.of(),
            "suggestedAction", "Inspect the controlled sample."));
        String raw = JSON.writeValueAsString(Map.of("candidates", List.of(Map.of(
            "finishReason", "STOP", "content", Map.of("parts", List.of(Map.of("text", report)))))));
        server.expect(requestTo("https://generativelanguage.googleapis.com/v1beta/models/"
            + GeminiAiReviewProvider.MODEL + ":generateContent"))
            .andRespond(withSuccess(raw, MediaType.APPLICATION_JSON));
        GeminiAiReviewProvider provider = new GeminiAiReviewProvider("test-key", builder.build(), JSON, 0);
        AiReviewProvider.Input input = new AiReviewProvider.Input("mock-raw-response", "%PDF-mock".getBytes(StandardCharsets.UTF_8),
            "mock extracted content", AiReviewService.SYSTEM_INSTRUCTION,
            "Software Test Document (STD)", NO_TEMPLATE_INSTRUCTIONS, "");
        AiReviewProvider.Result result = provider.review(input);
        assertThat(result.summary()).contains("test-key");
        assertThat(captured.generateCalls).hasValue(1);
        assertThat(captured.httpStatus).isEqualTo(200);
        assertThat(captured.rawPayloadExact).isFalse();
        assertThat(captured.rawPayloadSha256).isEqualTo(sha256(raw.getBytes(StandardCharsets.UTF_8)));
        assertThat(Files.readString(evidence.resolve("provider-response.raw.json")))
            .doesNotContain("test-key").contains("[REDACTED_API_KEY]");
        assertThat(captured.savedPayloadSha256)
            .isEqualTo(sha256(Files.readAllBytes(evidence.resolve("provider-response.raw.json"))));
        server.verify();
    }

    private static Prepared mockPrepared(String id, String cacheVersion) {
        return new Prepared(id, "%PDF-mock".getBytes(StandardCharsets.UTF_8), "fixture text",
            "STD-18".equals(id) ? "" : "Official template", "fixture-sha", "template-sha",
            "frozen-sha", Instant.now().minusSeconds(1).toString(), "manifest-sha", "checklist-sha",
            "protocol-sha", NO_TEMPLATE_INSTRUCTIONS,
            "app-sha", cacheVersion);
    }
}
