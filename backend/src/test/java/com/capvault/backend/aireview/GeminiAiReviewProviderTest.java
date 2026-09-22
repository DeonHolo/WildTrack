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
    private static final String GENERATE = ORIGIN + "/v1beta/models/gemini-3.1-flash-lite:generateContent";
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
        return response("{\"summary\":\"Requirements need clearer acceptance criteria.\",\"findings\":[{\"issue\":\"Requirement R1 has no measurable threshold.\",\"source\":\"DELIVERABLE_REQUIREMENTS\",\"evidence\":\"Section 3, requirement R1\",\"requirement\":\"Include functional requirements\"}],\"missingRequiredSections\":[],\"suggestedAction\":\"Ask the team to clarify R1.\"}", "STOP");
    }

    @Test void sendsOnePdfWithBoundedStructuredOutputAndNoDuplicatedText() throws Exception {
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST))
            .andExpect(header("x-goog-api-key", "test-key"))
            .andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingLevel").value("MINIMAL"))
            .andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingBudget").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.maxOutputTokens").value(8192))
            .andExpect(jsonPath("$.generationConfig.responseMimeType").value("application/json"))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.required.length()").value(4))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.findings.items.properties.source.enum.length()").value(3))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.missingRequiredSections.items.properties.source.enum.length()").value(2))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.maxItems").value(5))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.items.required.length()").value(4))
            .andExpect(jsonPath("$.contents[0].parts[1].inlineData.mimeType").value("application/pdf"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("hasOfficialTemplate")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("hasDeliverableInstructions")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("sample project names")))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("DO NOT SEND THIS DUPLICATE TEXT"))))
            .andRespond(withSuccess(validResponse(), MediaType.APPLICATION_JSON));
        var result = provider.review(input());
        assertThat(result.findings()).hasSize(1);
        assertThat(result.findings().get(0).source()).isEqualTo(AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS);
        assertThat(result.missingRequiredSections()).isEmpty();
        assertThat(result.verifiedChecks()).isEmpty();
        assertThat(result.limitations()).isEmpty();
        assertThat(provider.cacheVersion()).contains("gemini-3.1-flash-lite", "rest-pdf-v5", "thinking-minimal", "output-8192");
        server.verify();
    }

    @Test void noTemplateIsExplicitInputStateAndProducesDeterministicReviewLimit() throws Exception {
        var noTemplate = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), "duplicate",
            "Instructor review only", "Refactored SPMP", "", "");
        String report = response("{\"summary\":\"The PDF identifies itself as an Individual Problem Exploration report rather than the requested Refactored SPMP.\",\"findings\":[{\"issue\":\"The submitted PDF identifies itself as Individual Problem Exploration.\",\"source\":\"DOCUMENT\",\"evidence\":\"Page 1: Part A: Individual Problem Exploration\",\"requirement\":\"\"}],\"missingRequiredSections\":[],\"suggestedAction\":\"Verify that the correct Refactored SPMP file was submitted.\"}", "STOP");
        server.expect(requestTo(GENERATE))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("hasOfficialTemplate")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("false")))
            .andRespond(withSuccess(report, MediaType.APPLICATION_JSON));

        var result = provider.review(noTemplate);
        assertThat(result.findings()).extracting(AiReviewProvider.Finding::source)
            .containsExactly(AiReviewProvider.FindingSource.DOCUMENT);
        assertThat(result.missingRequiredSections()).isEmpty();
        assertThat(result.limitations()).containsExactly(
            "No official template was supplied, so compliance with a specific template structure was not assessed.",
            "No deliverable Instructions were supplied, so requirement compliance is limited to the requested deliverable identity and document evidence.");
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

    @Test void unauthorizedGenerationIsClassifiedWithoutReturningProviderErrorBody() {
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.UNAUTHORIZED)
            .body("private provider request and key details"));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("API_KEY_REJECTED").hasNoCause();
        server.verify();
    }

    @Test void timeoutDoesNotRetryAnUncertainGeneration() {
        server.expect(requestTo(GENERATE)).andRespond(withException(new java.net.SocketTimeoutException("timeout")));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("PROVIDER_TIMEOUT");
        server.verify();
    }

    @Test void truncatedAndMalformedResultsAreNotAccepted() throws Exception {
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{}", "MAX_TOKENS"), MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{\"summary\":\"Missing required fields\"}", "STOP"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("OUTPUT_TRUNCATED");
        assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        server.verify();
    }

    @Test void missingCandidateAndAbsentFinishAreInvalidResponsesNotContentBlocks() throws Exception {
        server.expect(requestTo(GENERATE)).andRespond(withSuccess("{\"candidates\":[]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(
            "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"{}\"}]}}]}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        server.verify();
    }

    @Test void nonSafetyFinishDoesNotMasqueradeAsContentBlock() throws Exception {
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{}", "OTHER"), MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{}", "MALFORMED_FUNCTION_CALL"), MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{}", "SAFETY"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("PROVIDER_OUTCOME_UNKNOWN");
        assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        assertThatThrownBy(() -> provider.review(input())).hasMessage("CONTENT_BLOCKED");
        server.verify();
    }

    @Test void malformedOrAbsentTextNeverProducesSuccessOrFabricatedFindings() throws Exception {
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{malformed", "STOP"), MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response("{}", "STOP"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        server.verify();
    }

    @Test void legacyFiveArgumentResultAndPreviouslySavedJsonDefaultToEmptyVerifiedChecks() throws Exception {
        var oldResult = new AiReviewProvider.Result("Review summary", List.of(), List.of(), List.of(), "Review document.");
        assertThat(oldResult.verifiedChecks()).isEmpty();
        String oldJson = "{\"summary\":\"Review summary\",\"findings\":[],"
            + "\"missingRequiredSections\":[],\"limitations\":[],\"suggestedAction\":\"Review document.\"}";
        var restored = json.readValue(oldJson, AiReviewProvider.Result.class);
        assertThat(restored.verifiedChecks()).isEmpty();
    }

    @Test void parsesNarrowPositiveChecksWithDocumentAndAuthorityEvidence() throws Exception {
        var documentCheck = Map.of("aspect", "Section 2.1 describes the project scope", "source", "DOCUMENT",
            "documentEvidence", "The system supports account registration and role-specific access.");
        var authorityCheck = Map.of("aspect", "Section 3.2 identifies functional requirements",
            "source", "DELIVERABLE_REQUIREMENTS", "documentEvidence", "FR-01: The student can submit a PDF.",
            "requirement", "Include functional requirements");
        String report = json.writeValueAsString(Map.of("summary", "The document specifies role access and one functional requirement.",
            "findings", List.of(), "missingRequiredSections", List.of(),
            "suggestedAction", "Review other requirements independently.", "verifiedChecks", List.of(documentCheck, authorityCheck)));
        server.expect(requestTo(GENERATE))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("exact verbatim PDF body text")))
            .andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));

        var result = provider.review(input());
        assertThat(result.findings()).isEmpty();
        assertThat(result.verifiedChecks()).hasSize(2);
        assertThat(result.verifiedChecks()).extracting(AiReviewProvider.VerifiedCheck::source)
            .containsExactly(AiReviewProvider.FindingSource.DOCUMENT,
                AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS);
        assertThat(result.verifiedChecks().get(0).requirement()).isEmpty();
        assertThat(result.verifiedChecks().get(1).requirement()).isEqualTo("Include functional requirements");
        assertThat(result.verifiedChecks().get(1).documentEvidence())
            .isEqualTo("FR-01: The student can submit a PDF.");
        server.verify();
    }

    @Test void rejectsMalformedVerifiedChecksWithoutInventingPositiveEvidence() throws Exception {
        var valid = Map.of("aspect", "Section 2.1 describes scope", "source", "DOCUMENT",
            "documentEvidence", "The system supports account registration.", "requirement", "");
        var noQuote = Map.of("aspect", "Section 2.1 describes scope", "source", "DOCUMENT",
            "documentEvidence", "", "requirement", "");
        var missingAuthority = Map.of("aspect", "Section 3.2 lists functional requirements",
            "source", "OFFICIAL_TEMPLATE", "documentEvidence", "FR-01: The student can submit a PDF.",
            "requirement", "");
        var inventedAuthority = Map.of("aspect", "Section 2.1 describes scope", "source", "DOCUMENT",
            "documentEvidence", "The system supports account registration.", "requirement", "Include functional requirements");
        for (Object checks : List.of("not an array", java.util.Collections.nCopies(6, valid),
                List.of(noQuote), List.of(missingAuthority), List.of(inventedAuthority))) {
            String report = json.writeValueAsString(Map.of("summary", "Narrow observations only.",
                "findings", List.of(), "missingRequiredSections", List.of(),
                "suggestedAction", "Check other sections independently.", "verifiedChecks", checks));
            server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));
        }
        for (int attempt = 0; attempt < 5; attempt++) {
            assertThatThrownBy(() -> provider.review(input())).hasMessage("INVALID_RESPONSE");
        }
        server.verify();
    }

    @Test void validStructuredReviewCanExceedOldThirtyThousandCharacterLimit() throws Exception {
        var findings = new java.util.ArrayList<Map<String, String>>();
        for (int i = 0; i < 8; i++) {
            findings.add(Map.of("issue", "Issue " + i + ": " + "i".repeat(1_700),
                "source", "DELIVERABLE_REQUIREMENTS", "evidence", "Page " + i + ": " + "e".repeat(1_700),
                "requirement", "Requirement " + i + ": " + "r".repeat(1_700)));
        }
        var missing = new java.util.ArrayList<Map<String, String>>();
        for (int i = 0; i < 8; i++) {
            missing.add(Map.of("section", "Section " + i + ": " + "s".repeat(450),
                "source", "OFFICIAL_TEMPLATE", "requirement", "Template " + i + ": " + "t".repeat(1_700)));
        }
        String report = json.writeValueAsString(Map.of("summary", "Review summary", "findings", findings,
            "missingRequiredSections", missing, "suggestedAction", "Review cited passages."));
        assertThat(report.length()).isGreaterThan(30_000).isLessThanOrEqualTo(100_000);
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));

        var result = provider.review(input());
        assertThat(result.findings()).hasSize(8);
        assertThat(result.missingRequiredSections()).hasSize(8);
        assertThat(result.findings().get(0).requirement()).hasSize(1_715);
        server.verify();
    }

    @Test void jsonLargerThanBoundIsRejectedEvenIfItsStructureIsOtherwiseValid() throws Exception {
        String report = "{\"summary\":\"Valid summary\",\"findings\":[],\"missingRequiredSections\":[],\"suggestedAction\":\"Valid action\"}";
        String oversized = report + " ".repeat(100_001);
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(oversized, "STOP"), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("INVALID_RESPONSE");
                assertThat(failure.detail).isEqualTo("oversized_json_text");
            });
        server.verify();
    }

    @Test void documentOnlyFindingMayOmitInapplicableRequirementButAuthorityClaimMustQuoteIt() throws Exception {
        String documentOnly = "{\"summary\":\"Document identifies a different deliverable.\",\"findings\":[{\"issue\":\"Different deliverable identity.\",\"source\":\"DOCUMENT\",\"evidence\":\"Page 1: Individual Exploration\"}],\"missingRequiredSections\":[],\"suggestedAction\":\"Verify submitted file.\"}";
        String unquotedAuthority = "{\"summary\":\"A section is missing.\",\"findings\":[{\"issue\":\"A requirement is unmet.\",\"source\":\"OFFICIAL_TEMPLATE\",\"evidence\":\"Page 2\",\"requirement\":null}],\"missingRequiredSections\":[],\"suggestedAction\":\"Review the source.\"}";
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(documentOnly, "STOP"), MediaType.APPLICATION_JSON));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(unquotedAuthority, "STOP"), MediaType.APPLICATION_JSON));
        assertThat(provider.review(input()).findings().get(0).requirement()).isEmpty();
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
