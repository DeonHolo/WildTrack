package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GeminiAiReviewProviderTest {
    private static final String ORIGIN = "https://generativelanguage.googleapis.com";
    private static final String GENERATE = ORIGIN + "/v1beta/models/gemini-2.5-flash-lite:generateContent";
    private final ObjectMapper json = new ObjectMapper();
    private RestClient client;
    private MockRestServiceServer server;
    private GeminiAiReviewProvider provider;

    @BeforeEach void setup() {
        var builder = RestClient.builder().baseUrl(ORIGIN);
        server = MockRestServiceServer.bindTo(builder).build();
        client = builder.build();
        provider = new GeminiAiReviewProvider("test-key", client, json, 0);
    }

    private AiReviewProvider.Input input(byte[] pdf) {
        return new AiReviewProvider.Input("claim", pdf, "DO NOT SEND THIS DUPLICATE TEXT", "Instructor review only",
            "SRS", "Include functional requirements", "Required sections");
    }
    private AiReviewProvider.Input input() { return input("%PDF-test".getBytes(StandardCharsets.UTF_8)); }
    private String response(String report, String finish) throws Exception {
        return json.writeValueAsString(Map.of("candidates", List.of(Map.of("finishReason", finish,
            "content", Map.of("parts", List.of(Map.of("text", report)))))));
    }
    private String validResponse() throws Exception {
        return response("{\"summary\":\"Requirements need clearer acceptance criteria.\",\"flags\":[\"Section 3: requirement R1 has no measurable threshold.\"],\"missingSections\":[],\"suggestedAction\":\"Ask the team to clarify R1.\"}", "STOP");
    }

    @Test void sendsOnePdfWithBoundedStructuredOutputAndNoDuplicatedText() throws Exception {
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST))
            .andExpect(header("x-goog-api-key", "test-key"))
            .andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingBudget").value(0))
            .andExpect(jsonPath("$.generationConfig.maxOutputTokens").value(2048))
            .andExpect(jsonPath("$.generationConfig.responseMimeType").value("application/json"))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.required.length()").value(4))
            .andExpect(jsonPath("$.contents[0].parts[1].inlineData.mimeType").value("application/pdf"))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("DO NOT SEND THIS DUPLICATE TEXT"))))
            .andRespond(withSuccess(validResponse(), MediaType.APPLICATION_JSON));
        var result = provider.review(input());
        assertThat(result.flags()).hasSize(1);
        assertThat(result.missingSections()).isEmpty();
        assertThat(provider.cacheVersion()).contains("gemini-2.5-flash-lite", "thinking-0", "output-2048");
        server.verify();
    }

    @Test void missingKeyDoesNotSendAnything() {
        var disabled = new GeminiAiReviewProvider(" ", client, json, 0);
        assertThat(disabled.isConfigured()).isFalse();
        assertThatThrownBy(() -> disabled.review(input())).hasMessage("NOT_CONFIGURED");
        server.verify();
    }

    @Test void quotaFailureDoesNotRetryAndBlocksSubsequentCallsDuringCooldown() {
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
            .body("sensitive provider body").contentType(MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("RATE_LIMITED");
        assertThatThrownBy(() -> provider.review(input())).hasMessage("RATE_LIMITED");
        server.verify();
    }

    @Test void authorizationFailureIsSanitizedAndNeverRetried() {
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.FORBIDDEN).body("test-key sensitive details"));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("API_KEY_REJECTED").hasNoCause();
        server.verify();
    }

    @Test void timeoutDoesNotRetryAnUncertainGeneration() {
        server.expect(requestTo(GENERATE)).andRespond(withException(new java.net.SocketTimeoutException("timeout")));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("PROVIDER_OUTCOME_UNKNOWN");
        server.verify();
    }

    @Test void truncatedAndMalformedResultsAreNotAccepted() throws Exception {
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{}", "MAX_TOKENS"), MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{\"summary\":\"Missing required fields\"}", "STOP"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("OUTPUT_TRUNCATED");
        assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        server.verify();
    }

    @Test void largePdfUploadsOnceUsesFileReferenceAndDeletesAfterReview() throws Exception {
        byte[] large = new byte[10 * 1024 * 1024 + 1];
        server.expect(requestTo(ORIGIN + "/upload/v1beta/files"))
            .andExpect(header("X-Goog-Upload-Header-Content-Length", Integer.toString(large.length)))
            .andRespond(withSuccess().header("X-Goog-Upload-URL", ORIGIN + "/upload/session"));
        server.expect(requestTo(ORIGIN + "/upload/session")).andExpect(content().bytes(large))
            .andRespond(withSuccess("{\"file\":{\"name\":\"files/pdf1\",\"uri\":\"" + ORIGIN + "/v1beta/files/pdf1\",\"state\":\"ACTIVE\"}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE))
            .andExpect(jsonPath("$.contents[0].parts[1].fileData.fileUri").value(ORIGIN + "/v1beta/files/pdf1"))
            .andRespond(withSuccess(validResponse(), MediaType.APPLICATION_JSON));
        server.expect(requestTo(ORIGIN + "/v1beta/files/pdf1")).andExpect(method(HttpMethod.DELETE))
            .andRespond(withNoContent());
        assertThat(provider.review(input(large)).summary()).isNotBlank();
        server.verify();
    }

    @Test void rejectsUnexpectedUploadHostWithoutSendingKeyOrDocumentThere() {
        server.expect(requestTo(ORIGIN + "/upload/v1beta/files"))
            .andRespond(withSuccess().header("X-Goog-Upload-URL", "https://other.example/upload"));
        assertThatThrownBy(() -> provider.review(input(new byte[10 * 1024 * 1024 + 1])))
            .hasMessage("INVALID_RESPONSE");
        server.verify();
    }
}
