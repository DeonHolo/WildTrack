package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

class GeminiProviderCooldownTest {
    private static final String GENERATE = "https://generativelanguage.googleapis.com/v1beta/models/" + GeminiAiReviewProvider.MODEL + ":generateContent";
    private final ObjectMapper json = new ObjectMapper();
    private MockRestServiceServer server;
    private GeminiAiReviewProvider provider;

    @BeforeEach void setup() {
        var builder = RestClient.builder().baseUrl("https://generativelanguage.googleapis.com");
        server = MockRestServiceServer.bindTo(builder).build();
        provider = new GeminiAiReviewProvider("test-key", builder.build(), json, 0);
    }

    private AiReviewProvider.Input input() {
        return new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), "", "Review", "SRS", "", "");
    }

    private static RestClientResponseException response(String header, String body) {
        var headers = new HttpHeaders();
        if (header != null) headers.set("Retry-After", header);
        return new RestClientResponseException("rate limited", 429, "Too Many Requests", headers,
            body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    }

    @Test void parsesRetryInfoFractionalSecondsAndUsesTheLargerHint() {
        var error = response("2", "{\"error\":{\"details\":[{\"@type\":\"type.googleapis.com/google.rpc.RetryInfo\",\"retryDelay\":\"12.3456s\"}]}}");
        assertThat(GeminiAiReviewProvider.cooldownHintMillis(error, 0)).isEqualTo(12_346);
    }

    @Test void parsesRetryAfterSecondsAndHttpDateWithBound() {
        long now = Instant.parse("2026-10-29T00:00:00Z").toEpochMilli();
        var date = DateTimeFormatter.RFC_1123_DATE_TIME.format(Instant.ofEpochMilli(now + 20_000).atZone(ZoneOffset.UTC));
        assertThat(GeminiAiReviewProvider.cooldownHintMillis(response(date, "{}"), now)).isEqualTo(20_000);
        assertThat(GeminiAiReviewProvider.cooldownHintMillis(response("9999999999", "{}"), now)).isEqualTo(3_600_000);
    }

    @Test void malformedHintsUseBoundedBackoffAndNeverReplayTheFailedRequest() {
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", "invalid").body("{not json").contentType(MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).isInstanceOf(GeminiAiReviewProvider.Failure.class);
        assertThat(provider.retryDelayMillis()).isBetween(29_000L, 37_500L);
        assertThatThrownBy(() -> provider.review(input())).isInstanceOf(GeminiAiReviewProvider.Failure.class);
        server.verify();
    }

    @Test void http429AppliesRetryInfoToTheSharedCooldown() {
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", "2").body("{\"error\":{\"details\":[{\"@type\":\"type.googleapis.com/google.rpc.RetryInfo\",\"retryDelay\":\"12s\"}]}}")
            .contentType(MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).isInstanceOf(GeminiAiReviewProvider.Failure.class);
        assertThat(provider.retryDelayMillis()).isBetween(11_000L, 12_000L);
        server.verify();
    }

    @Test void successfulResponseDoesNotSetCooldown() throws Exception {
        String report = "{\"summary\":\"Review saved.\",\"findings\":[],\"missingRequiredSections\":[],\"suggestedAction\":\"Inspect the PDF.\",\"verifiedChecks\":[]}";
        String body = json.writeValueAsString(Map.of("candidates", List.of(Map.of("finishReason", "STOP", "content", Map.of("parts", List.of(Map.of("text", report)))))));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
        provider.review(input());
        assertThat(provider.retryDelayMillis()).isZero();
        server.verify();
    }
}
