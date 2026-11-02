package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import java.util.*;
import java.util.function.IntSupplier;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.test.web.client.*;
import org.springframework.web.client.RestClient;

class GeminiAutomaticQuotaWaitTest {
    private static final String ORIGIN = "https://generativelanguage.googleapis.com/v1beta/models/" + GeminiAiReviewProvider.MODEL;
    private final ObjectMapper json = new ObjectMapper();
    private final GeminiRequestBudgetTest.TestClock clock = new GeminiRequestBudgetTest.TestClock();
    private final GeminiRequestBudget budget = mock(GeminiRequestBudget.class);
    private final List<Long> waits = new ArrayList<>();
    private MockRestServiceServer server;
    private GeminiAiReviewProvider provider;

    @BeforeEach void setup() {
        var builder = RestClient.builder().baseUrl("https://generativelanguage.googleapis.com");
        server = MockRestServiceServer.bindTo(builder).build();
        when(budget.count(anyString(), any())).thenAnswer(i -> ((IntSupplier) i.getArgument(1)).getAsInt());
        when(budget.reserve(anyInt())).thenAnswer(i -> new GeminiRequestBudget.Reservation(UUID.randomUUID(), null));
        provider = new GeminiAiReviewProvider("test", builder.build(), json, 0, "MINIMAL", 8192, null, budget, clock,
            ms -> { assertThat(provider.waitStatus()).isNotNull(); waits.add(ms); clock.advance(ms); });
    }
    private AiReviewProvider.Input input() {
        return new AiReviewProvider.Input("claim", "%PDF-fixture".getBytes(java.nio.charset.StandardCharsets.UTF_8),
            "A submitted project plan.", "Review the student output.", "SPMP", "Explain the plan.", "Required template instructions.");
    }
    private void count() {
        server.expect(requestTo(ORIGIN + ":countTokens")).andExpect(content().json("{\"generateContentRequest\":{\"model\":\"models/gemini-3.5-flash-lite\"}}"))
            .andExpect(jsonPath("$.generateContentRequest.systemInstruction.parts[0].text").isNotEmpty())
            .andExpect(jsonPath("$.generateContentRequest.contents[0].parts[1].inlineData.mimeType").value("application/pdf"))
            .andRespond(withSuccess("{\"totalTokens\":10000}", MediaType.APPLICATION_JSON));
    }
    private String success() throws Exception {
        var report = "{\"summary\":\"Review saved.\",\"findings\":[],\"missingRequiredSections\":[],\"suggestedAction\":\"Inspect the PDF.\",\"verifiedChecks\":[]}";
        return json.writeValueAsString(Map.of("usageMetadata", Map.of("promptTokenCount", 10120), "candidates", List.of(Map.of("finishReason", "STOP", "content", Map.of("parts", List.of(Map.of("text", report)))))));
    }
    private String quota(String id) {
        return "{\"error\":{\"details\":[{\"@type\":\"type.googleapis.com/google.rpc.QuotaFailure\",\"violations\":[{\"quotaId\":\"" + id + "\"}]}]}}";
    }

    @Test void aMinuteRejectionWaitsThenContinuesWithoutRepeatingTokenCounting() throws Exception {
        count();
        server.expect(requestTo(ORIGIN + ":generateContent")).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
            .body(quota("GenerateContentInputTokensPerMinutePerProject" )).contentType(MediaType.APPLICATION_JSON));
        server.expect(requestTo(ORIGIN + ":generateContent")).andRespond(withSuccess(success(), MediaType.APPLICATION_JSON));
        assertThat(provider.review(input()).summary()).isEqualTo("Review saved.");
        assertThat(waits).hasSize(1).allSatisfy(ms -> assertThat(ms).isGreaterThanOrEqualTo(65000));
        verify(budget, times(2)).reserve(10428);
        verify(budget).complete(any(), eq(10120), eq(200));
        assertThat(provider.waitStatus()).isNull();
        server.verify();
    }
    @Test void aDailyRejectionIsSavedAndNeverAutomaticallyRetried() {
        count();
        server.expect(requestTo(ORIGIN + ":generateContent")).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
            .body(quota("GenerateRequestsPerDayPerProject" )).contentType(MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
            f -> assertThat(f.code).isEqualTo("DAILY_LIMIT_REACHED"));
        assertThat(waits).isEmpty(); verify(budget).block(any(), eq("DAILY_LIMIT_REACHED")); server.verify();
    }
    @Test void repeatedMinuteRejectionsStopAfterTwoAutomaticRetries() {
        count();
        for (int i = 0; i < 3; i++) server.expect(requestTo(ORIGIN + ":generateContent"))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body(quota("GenerateRequestsPerMinutePerProject")).contentType(MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
            f -> assertThat(f.code).isEqualTo("RATE_LIMITED"));
        assertThat(waits).hasSize(2); server.verify();
    }
    @Test void uncertainTransportFailureIsNeverAutomaticallyResent() {
        count();
        server.expect(requestTo(ORIGIN + ":generateContent")).andRespond(withException(new java.net.SocketTimeoutException("test timeout")));
        assertThatThrownBy(() -> provider.review(input())).isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
            f -> assertThat(f.code).isEqualTo("PROVIDER_TIMEOUT"));
        assertThat(waits).isEmpty(); server.verify();
    }
    @Test void localTokenCapacityWaitHappensBeforeTheOnlyGeneration() throws Exception {
        when(budget.reserve(anyInt())).thenReturn(new GeminiRequestBudget.Reservation(null, clock.instant().plusSeconds(65)),
            new GeminiRequestBudget.Reservation(UUID.randomUUID(), null));
        count(); server.expect(requestTo(ORIGIN + ":generateContent")).andRespond(withSuccess(success(), MediaType.APPLICATION_JSON));
        provider.review(input()); assertThat(waits).containsExactly(65000L); server.verify();
    }

    @Test void usageTelemetryFailureDoesNotDiscardAValidResponse() throws Exception {
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("test database unavailable"))
            .when(budget).complete(any(), any(), anyInt());
        count(); server.expect(requestTo(ORIGIN + ":generateContent")).andRespond(withSuccess(success(), MediaType.APPLICATION_JSON));
        assertThat(provider.review(input()).summary()).isEqualTo("Review saved.");
        assertThat(waits).isEmpty(); server.verify();
    }

    @Test void unavailableQuotaAccountingStopsBeforeInferenceWithASpecificReason() {
        when(budget.reserve(anyInt())).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("test unavailable"));
        count();
        assertThatThrownBy(() -> provider.review(input())).isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
            f -> assertThat(f.code).isEqualTo("TOKEN_COUNT_UNAVAILABLE"));
        server.verify();
    }
}
