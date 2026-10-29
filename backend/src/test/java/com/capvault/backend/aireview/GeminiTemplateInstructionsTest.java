package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import com.capvault.backend.template.TemplateInstructionGateway;
import com.capvault.backend.template.TemplateInstructionPreparation;
import com.capvault.backend.template.TemplateInstructionProtocol;
import com.capvault.backend.template.TemplateInstructionStore;
import com.capvault.backend.template.TemplatePdfStore;
import com.capvault.backend.template.TemplateProviderFileStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GeminiTemplateInstructionsTest {
    private static final String ORIGIN = "https://generativelanguage.googleapis.com";
    private static final String GENERATE = ORIGIN + "/v1beta/models/gemini-3.5-flash-lite:generateContent";
    private static final String KEY = "test-template-key";
    private static final String USERS = "Explain named users and their assigned responsibilities.";
    private static final String RISKS = "Describe project risks and the planned mitigation activities.";
    private static final UUID VERSION = UUID.fromString("12345678-1234-1234-1234-123456789abc");
    private final ObjectMapper json = new ObjectMapper();
    private final Map<CacheKey, TemplateProviderFileStore.File> cache = new HashMap<>();
    private final Map<CacheKey, UUID> claims = new HashMap<>();
    private final AtomicInteger generations = new AtomicInteger();
    private TemplateProviderFileStore files;
    private RestClient client;
    private MockRestServiceServer server;
    private GeminiAiReviewProvider provider;
    private TemplateInstructionGateway.Input input;

    @BeforeEach
    void setUp() throws Exception {
        var builder = RestClient.builder().baseUrl(ORIGIN);
        server = MockRestServiceServer.bindTo(builder).build();
        client = builder.build();
        files = mock(TemplateProviderFileStore.class);
        when(files.find(any(), anyString(), anyString())).thenAnswer(call -> Optional.ofNullable(cache.get(key(call.getArguments())))
            .filter(file -> file.expiresAt().isAfter(Instant.now().plusSeconds(300))));
        when(files.claim(any(), anyString(), anyString())).thenAnswer(call -> {
            CacheKey identity = key(call.getArguments());
            UUID token = UUID.randomUUID();
            return claims.putIfAbsent(identity, token) == null ? Optional.of(token) : Optional.empty();
        });
        when(files.complete(any(), anyString(), any(), any())).thenAnswer(call -> {
            var owner = claims.entrySet().stream().filter(entry -> entry.getKey().version().equals(call.getArgument(0))
                && entry.getKey().context().equals(call.getArgument(1)) && entry.getValue().equals(call.getArgument(2))).findFirst();
            if (owner.isEmpty()) return false;
            cache.put(owner.get().getKey(), call.getArgument(3));
            claims.remove(owner.get().getKey());
            return true;
        });
        doAnswer(call -> {
            cache.replaceAll((identity, file) -> identity.version().equals(call.getArgument(0))
                && identity.context().equals(call.getArgument(1)) && file.name().equals(call.getArgument(2))
                    ? new TemplateProviderFileStore.File(file.name(), file.uri(), Instant.now().minusSeconds(1)) : file);
            return null;
        }).when(files).invalidate(any(), anyString(), anyString());
        doAnswer(call -> {
            claims.entrySet().removeIf(entry -> entry.getKey().version().equals(call.getArgument(0))
                && entry.getKey().context().equals(call.getArgument(1)) && entry.getValue().equals(call.getArgument(2)));
            return null;
        }).when(files).release(any(), anyString(), any());
        provider = provider(KEY);
        byte[] pdf = pdf();
        input = new TemplateInstructionGateway.Input(VERSION, pdf, AiReviewService.sha256(pdf),
            TemplateInstructionPreparation.pageTexts(pdf), 2, 3);
    }

    @Test
    void uploadsTheRetainedPdfAndClearlyLabelsItsRoleAndAbsolutePageGroup() throws Exception {
        expectUpload("template-first", KEY);
        expectGeneration("template-first", KEY, validReport(), "STOP");

        var result = provider.prepareInstructions(input);

        assertThat(result).extracting(TemplateInstructionProtocol.Draft::instruction).containsExactly(USERS, RISKS);
        assertThat(result).extracting(TemplateInstructionProtocol.Draft::sourceQuote).containsExactly(USERS, RISKS);
        assertThat(result).extracting(TemplateInstructionProtocol.Draft::page).containsExactly(2, 3);
        assertThat(generations).hasValue(1);
        assertThat(cache).hasSize(1);
        assertThat(claims).isEmpty();
        server.verify(); // A DELETE of this shared template would be an unexpected request.
    }

    @Test
    void aSecondRequestReusesAnActiveFileWithoutUploadingOrChangingSourceInputs() throws Exception {
        expectUpload("template-first", KEY);
        expectGeneration("template-first", KEY, validReport(), "STOP");
        expectActive("template-first", KEY);
        expectGeneration("template-first", KEY, validReport(), "STOP");

        var first = provider.prepareInstructions(input);
        var second = provider.prepareInstructions(input);

        assertThat(second).containsExactlyElementsOf(first);
        assertThat(cache).hasSize(1);
        assertThat(generations).hasValue(2);
        assertThat(input.pdfSha256()).isEqualTo(AiReviewService.sha256(input.pdf()));
        server.verify();
    }

    @Test
    void removedRemoteFileIsReuploadedAndOnlyItsOldCacheEntryIsInvalidated() throws Exception {
        cache.put(identity(KEY), file("template-removed"));
        server.expect(requestTo(ORIGIN + "/v1beta/files/template-removed")).andExpect(method(HttpMethod.GET))
            .andRespond(withStatus(HttpStatus.NOT_FOUND).body("private old-file information"));
        expectUpload("template-recovered", KEY);
        expectGeneration("template-recovered", KEY, validReport(), "STOP");

        var result = provider.prepareInstructions(input);

        verify(files).invalidate(VERSION, context(KEY), "files/template-removed");
        assertThat(cache.get(identity(KEY)).name()).isEqualTo("files/template-recovered");
        assertThat(result).extracting(TemplateInstructionProtocol.Draft::sourceQuote).containsExactly(USERS, RISKS);
        assertThat(generations).hasValue(1);
        server.verify();
    }

    @Test
    void expiredProviderHandleIsReuploadedFromTheSameRetainedPdf() throws Exception {
        var expired = file("template-expired");
        cache.put(identity(KEY), new TemplateProviderFileStore.File(expired.name(), expired.uri(), Instant.now().minusSeconds(10)));
        expectUpload("template-refreshed", KEY);
        expectGeneration("template-refreshed", KEY, validReport(), "STOP");

        var result = provider.prepareInstructions(input);

        assertThat(cache.get(identity(KEY)).name()).isEqualTo("files/template-refreshed");
        assertThat(result).hasSize(2);
        assertThat(generations).hasValue(1);
        server.verify();
    }

    @Test
    void credentialContextsAreHashedAndCannotReuseAnotherKeysTemplateHandle() throws Exception {
        String otherKey = "other-test-template-key";
        cache.put(identity(KEY), file("template-key-one"));
        expectUpload("template-key-two", otherKey);
        expectGeneration("template-key-two", otherKey, validReport(), "STOP");

        provider(otherKey).prepareInstructions(input);

        assertThat(cache).containsKeys(identity(KEY), identity(otherKey));
        assertThat(cache.get(identity(KEY)).name()).isEqualTo("files/template-key-one");
        assertThat(identity(KEY).context()).hasSize(64).doesNotContain(KEY);
        assertThat(identity(otherKey).context()).isNotEqualTo(identity(KEY).context()).doesNotContain(otherKey);
        verify(files, org.mockito.Mockito.times(2)).find(VERSION, context(otherKey), input.pdfSha256());
        server.verify();
    }

    @Test
    void partialInstructionResponseFailsWithoutRetryingGenerationOrDeletingSharedFile() throws Exception {
        expectUpload("template-partial", KEY);
        var partial = validReport().deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) partial).put("complete", false);
        expectGeneration("template-partial", KEY, partial, "STOP");

        UUID workspace = UUID.randomUUID(), template = UUID.randomUUID();
        var pdfs = mock(TemplatePdfStore.class);
        var instructions = mock(TemplateInstructionStore.class);
        var state = new TemplateInstructionStore.State(VERSION, "PROCESSING", UUID.randomUUID(),
            1, List.of(), 0, null);
        when(pdfs.current(workspace, template)).thenReturn(new TemplatePdfStore.Status(VERSION,
            template, input.pdfSha256(), "official.pdf", "READY", 3, null, true));
        when(pdfs.readPdf(workspace, template, VERSION)).thenReturn(
            new TemplatePdfStore.Pdf(input.pdf(), input.pdfSha256(), "official.pdf"));
        when(instructions.find(VERSION)).thenReturn(Optional.empty());
        when(instructions.claim(VERSION, provider.cacheVersion(), null)).thenReturn(Optional.of(state));
        when(instructions.startRequest(state)).thenReturn(true);
        var preparation = new TemplateInstructionPreparation(pdfs, instructions, provider);

        assertThatThrownBy(() -> preparation.prepare(workspace, template, input.pdfSha256(), null))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
                failure -> assertThat(failure.code).isEqualTo("INVALID_RESPONSE"));
        verify(instructions).fail(state, "PREPARATION_FAILED");
        assertThat(generations).hasValue(1);
        assertThat(cache.get(identity(KEY)).name()).isEqualTo("files/template-partial");
        server.verify();
    }

    @Test
    void outputTruncationIsExplicitAndNeverTriggersAnotherPaidGeneration() throws Exception {
        cache.put(identity(KEY), file("template-truncated"));
        expectActive("template-truncated", KEY);
        expectGeneration("template-truncated", KEY, validReport(), "MAX_TOKENS");

        assertThatThrownBy(() -> provider.prepareInstructions(input))
            .isInstanceOf(TemplateInstructionGateway.OutputLimit.class);
        assertThat(generations).hasValue(1);
        assertThat(cache.get(identity(KEY)).name()).isEqualTo("files/template-truncated");
        server.verify();
    }

    @Test
    void malformedJsonAndOutOfRangeSourceIdsFailWithoutInventingAnInstructionList() throws Exception {
        cache.put(identity(KEY), file("template-malformed"));
        expectActive("template-malformed", KEY);
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST)).andRespond(withSuccess(
            envelope("{\"complete\":true,", "STOP"), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.prepareInstructions(input))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> assertThat(failure.code).isEqualTo("INVALID_RESPONSE"));
        server.verify();
        server.reset();
        expectActive("template-malformed", KEY);
        var wrongPage = validReport().deepCopy();
        ((com.fasterxml.jackson.databind.node.ObjectNode) wrongPage.path("instructions").get(0))
            .putArray("sourceIds").add("p1l1");
        expectGeneration("template-malformed", KEY, wrongPage, "STOP");
        assertThatThrownBy(() -> provider.prepareInstructions(input))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> assertThat(failure.code).isEqualTo("INVALID_RESPONSE"));
        assertThat(generations).hasValue(1);
        server.verify();
    }

    @Test
    void duplicateJsonKeysCannotTurnAPartialResponseIntoACompleteInstructionList() throws Exception {
        cache.put(identity(KEY), file("template-duplicate-keys"));
        expectActive("template-duplicate-keys", KEY);
        String duplicate = json.writeValueAsString(validReport()).replaceFirst("\\{", "{\"complete\":false,");
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST)).andRespond(withSuccess(
            envelope(duplicate, "STOP"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.prepareInstructions(input))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> assertThat(failure.detail).isEqualTo("malformed_json"));
        server.verify();
    }

    @Test
    void quotaFailureIsSanitizedAndCooldownPreventsAnotherUploadOrGeneration() throws Exception {
        cache.put(identity(KEY), file("template-quota"));
        expectActive("template-quota", KEY);
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
            .body(KEY + " private PDF content and provider diagnostic").contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.prepareInstructions(input))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("RATE_LIMITED");
                assertThat(failure.diagnostic.httpStatus()).isEqualTo(429);
                assertThat(failure.diagnostic.stage()).isEqualTo("template_instructions");
                assertThat(failure.toString()).doesNotContain(KEY, "private PDF");
                assertThat(failure.diagnostic.explanation()).doesNotContain(KEY, "private PDF");
                assertThat(failure).hasNoCause();
            });
        assertThatThrownBy(() -> provider.prepareInstructions(input)).hasMessage("RATE_LIMITED");
        assertThat(cache.get(identity(KEY)).name()).isEqualTo("files/template-quota");
        server.verify();
    }

    @Test
    void inconsistentRetainedPdfHashFailsBeforeAnyProviderRequest() {
        var changed = new TemplateInstructionGateway.Input(VERSION, input.pdf(), "d".repeat(64), input.pageTexts(), 2, 3);
        assertThatThrownBy(() -> provider.prepareInstructions(changed)).hasMessage("INVALID_RESPONSE");
        assertThat(cache).isEmpty();
        assertThat(claims).isEmpty();
        server.verify();
    }

    @Test
    void rejectsOversizedSourceContextBeforeUploadOrGeneration() {
        var oversized = new TemplateInstructionGateway.Input(VERSION, input.pdf(), input.pdfSha256(),
            List.of("X".repeat(2_000_001)), 1, 1);
        assertThatThrownBy(() -> provider.prepareInstructions(oversized))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
                failure -> assertThat(failure.code).isEqualTo("DOCUMENT_TOO_LARGE"));
        assertThat(generations).hasValue(0);
        assertThat(cache).isEmpty();
        assertThat(claims).isEmpty();
        server.verify();
    }

    private GeminiAiReviewProvider provider(String key) {
        return new GeminiAiReviewProvider(key, client, json, 0, "MINIMAL", 8192, files);
    }

    private void expectUpload(String id, String key) throws Exception {
        String upload = ORIGIN + "/upload/template-" + id;
        server.expect(requestTo(ORIGIN + "/upload/v1beta/files")).andExpect(method(HttpMethod.POST))
            .andExpect(header("x-goog-api-key", key)).andExpect(header("X-Goog-Upload-Protocol", "resumable"))
            .andExpect(header("X-Goog-Upload-Header-Content-Length", Integer.toString(input.pdf().length)))
            .andExpect(header("X-Goog-Upload-Header-Content-Type", "application/pdf"))
            .andRespond(withSuccess().header("X-Goog-Upload-URL", upload));
        server.expect(requestTo(upload)).andExpect(method(HttpMethod.POST)).andExpect(header("x-goog-api-key", key))
            .andExpect(header("X-Goog-Upload-Command", "upload, finalize"))
            .andExpect(content().bytes(input.pdf()))
            .andRespond(withSuccess(json.writeValueAsString(Map.of("file", remoteFile(id))), MediaType.APPLICATION_JSON));
    }

    private void expectActive(String id, String key) throws Exception {
        server.expect(requestTo(ORIGIN + "/v1beta/files/" + id)).andExpect(method(HttpMethod.GET))
            .andExpect(header("x-goog-api-key", key)).andRespond(withSuccess(json.writeValueAsString(remoteFile(id)), MediaType.APPLICATION_JSON));
    }

    private void expectGeneration(String id, String key, JsonNode report, String finish) throws Exception {
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST)).andExpect(header("x-goog-api-key", key))
            .andExpect(request -> {
                generations.incrementAndGet();
                JsonNode body = json.readTree(((MockClientHttpRequest) request).getBodyAsString());
                String guidance = body.path("systemInstruction").path("parts").get(0).path("text").asText();
                assertThat(guidance).isEqualTo(TemplateInstructionProtocol.GUIDANCE);
                JsonNode parts = body.path("contents").get(0).path("parts");
                assertThat(parts.size()).isEqualTo(3);
                assertThat(parts.get(0).path("text").asText()).contains("OFFICIAL TEMPLATE, not a student submission", "PDF pages 2 through 3", "absolute PDF page numbers");
                assertThat(parts.get(1).path("fileData").path("fileUri").asText()).isEqualTo(file(id).uri());
                assertThat(parts.get(1).path("fileData").path("mimeType").asText()).isEqualTo("application/pdf");
                assertThat(parts.toString()).doesNotContain("inlineData", KEY);
                String aid = parts.get(2).path("text").asText();
                assertThat(aid).startsWith("SOURCE BLOCKS:").contains(USERS, RISKS);
                JsonNode blocks = json.readTree(aid.substring(aid.indexOf('\n') + 1));
                assertThat(blocks.findValuesAsText("id")).containsExactly("p1l1", "p2l1", "p3l1");
                assertThat(blocks.get(0).path("inRequestedRange").asBoolean()).isFalse();
                assertThat(blocks.get(1).path("inRequestedRange").asBoolean()).isTrue();
                assertThat(blocks.get(2).path("inRequestedRange").asBoolean()).isTrue();
                assertThat(blocks.get(1).path("page").asInt()).isEqualTo(2);
                assertThat(blocks.get(2).path("page").asInt()).isEqualTo(3);
                assertThat(blocks.get(1).path("spans").get(0).path("firstLine").asInt()).isEqualTo(1);
                assertThat(blocks.get(1).path("spans").get(0).path("lastLine").asInt()).isEqualTo(1);
                assertThat(blocks.get(1).path("text").asText()).isEqualTo(USERS);
                assertThat(blocks.get(2).path("text").asText()).isEqualTo(RISKS);
                JsonNode config = body.path("generationConfig");
                assertThat(config.path("maxOutputTokens").asInt()).isEqualTo(32768);
                assertThat(config.path("thinkingConfig").path("thinkingLevel").asText()).isEqualTo("HIGH");
                assertThat(config.path("responseMimeType").asText()).isEqualTo("application/json");
                JsonNode schema = config.path("responseJsonSchema");
                assertThat(schema.path("required")).isEqualTo(json.valueToTree(TemplateInstructionProtocol.schema().get("required")));
                assertThat(schema.findValues("maxItems")).isEmpty();
                assertThat(schema.findValues("maxLength")).isEmpty();
                assertThat(schema.findValues("minimum")).isEmpty();
                assertThat(schema.path("properties").path("instructions").path("items").path("additionalProperties").asBoolean(true)).isFalse();
            }).andRespond(withSuccess(envelope(report.toString(), finish), MediaType.APPLICATION_JSON));
    }

    private JsonNode validReport() {
        return json.valueToTree(Map.of("complete", true, "firstPage", 2, "lastPage", 3,
            "instructions", List.of(draft("Describe named users", 2), draft("Describe risks", 3))));
    }

    private Map<String, Object> draft(String title, int page) {
        return Map.of("title", title, "kind", "INSTRUCTION", "sourceIds", List.of("p" + page + "l1"),
            "contextIds", List.of(), "applicability", "REQUIRED", "conditionIds", List.of(),
            "instruction", page == 2 ? USERS : RISKS);
    }

    private String envelope(String report, String finish) throws Exception {
        return json.writeValueAsString(Map.of("candidates", List.of(Map.of("finishReason", finish,
            "content", Map.of("parts", List.of(Map.of("text", report)))))));
    }

    private Map<String, Object> remoteFile(String id) {
        var file = file(id);
        return Map.of("name", file.name(), "uri", file.uri(), "state", "ACTIVE", "expirationTime", file.expiresAt().toString());
    }

    private TemplateProviderFileStore.File file(String id) {
        return new TemplateProviderFileStore.File("files/" + id, ORIGIN + "/v1beta/files/" + id,
            Instant.now().plus(48, ChronoUnit.HOURS));
    }

    private CacheKey identity(String key) { return new CacheKey(VERSION, context(key), input.pdfSha256()); }
    private String context(String key) { return AiReviewService.sha256(("gemini-files-v1\n" + key).getBytes(StandardCharsets.UTF_8)); }
    private CacheKey key(Object[] args) { return new CacheKey((UUID) args[0], (String) args[1], (String) args[2]); }
    private record CacheKey(UUID version, String context, String hash) { }

    private static byte[] pdf() throws Exception {
        try (var document = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            for (String text : List.of("Official project template - cover", USERS, RISKS)) {
                var page = new PDPage();
                document.addPage(page);
                try (var stream = new PDPageContentStream(document, page)) {
                    stream.beginText();
                    stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                    stream.newLineAtOffset(30, 700);
                    stream.showText(text);
                    stream.endText();
                }
            }
            document.save(bytes);
            return bytes.toByteArray();
        }
    }
}
