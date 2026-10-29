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
    private static final String GENERATE = ORIGIN + "/v1beta/models/gemini-3.5-flash-lite:generateContent";
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

    @Test void studentCitationAidLabelsAbsolutePagesAndDisclosesTruncation() {
        String complete = GeminiAiReviewProvider.studentCitationAid(List.of("cover", "", "body quotation"));
        assertThat(complete).contains("Absolute student PDF page 1", "Absolute student PDF page 2",
            "Absolute student PDF page 3", "body quotation").doesNotContain("truncated");
        String bounded = GeminiAiReviewProvider.studentCitationAid(List.of("x".repeat(250_000), "later page"));
        assertThat(bounded).contains("Absolute student PDF page 1", "truncated", "subsequent")
            .doesNotContain("later page");
        assertThat(bounded.length()).isLessThan(250_200);
        assertThat(AiReviewInstructionProtocol.GUIDANCE).contains("attached PDF itself", "including its visuals",
            "one to three short sentences", "uncertainty");
    }
    private String response(String report, String finish) throws Exception {
        return json.writeValueAsString(Map.of("candidates", List.of(Map.of("finishReason", finish,
            "content", Map.of("parts", List.of(Map.of("text", report)))))));
    }
    private String validResponse() throws Exception {
        return response("{\"summary\":\"Requirements need clearer acceptance criteria.\",\"findings\":[{\"issue\":\"Requirement R1 has no measurable threshold.\",\"source\":\"DELIVERABLE_REQUIREMENTS\",\"evidence\":\"Section 3, requirement R1\",\"requirement\":\"Include functional requirements\"}],\"missingRequiredSections\":[],\"suggestedAction\":\"Ask the team to clarify R1.\",\"verifiedChecks\":[]}", "STOP");
    }

    @Test void parsesTheSeparateDocumentOverviewWithoutReplacingTheReviewSummary() throws Exception {
        var overview = Map.of("text", "This questionnaire collects participant feedback.",
            "actualDocumentType", "a questionnaire", "wrongDocument", false, "evidence", "Participant questionnaire");
        String report = json.writeValueAsString(Map.of("summary", "Review result only", "documentOverview", overview,
            "findings", List.of(), "missingRequiredSections", List.of(), "suggestedAction", "Inspect the PDF.", "verifiedChecks", List.of()));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));
        var result = provider.review(input());
        assertThat(result.summary()).isEqualTo("Review result only");
        assertThat(result.documentOverview().text()).isEqualTo(overview.get("text"));
        assertThat(result.documentOverview().wrongDocument()).isFalse();
        server.verify();
    }

    @Test void maximumCoverageSchemaAvoidsRepeatedBoundedArrays() throws Exception {
        var method = GeminiAiReviewProvider.class.getDeclaredMethod("schema", int.class, int.class);
        method.setAccessible(true);
        for (int count : new int[]{0, 6, 110}) {
            var properties = json.valueToTree(method.invoke(null, 20, count)).path("properties");
            var coverage = properties.path("criterionReviews");
            assertThat(coverage.has("maxItems")).isFalse();
            assertThat(coverage.path("items").path("required").toString())
                .contains("criterionId", "assessment", "explanation", "documentEvidence");
            assertThat(coverage.path("items").path("properties").path("criterionId").path("enum").size())
                .isEqualTo(Math.max(1, count));
            for (String field : List.of("verifiedCheckIndexes", "findingIndexes",
                    "missingSectionIndexes", "verificationNoteIndexes")) {
                var indexes = coverage.path("items").path("properties").path(field);
                assertThat(indexes.has("maxItems")).isFalse();
                assertThat(indexes.path("items").path("maximum").asInt()).isEqualTo(49);
            }
            var itemProperties = coverage.path("items").path("properties");
            assertThat(itemProperties.path("assessment").path("enum").toString())
                .contains("APPEARS_ADDRESSED", "NEEDS_ATTENTION", "CHECK_MANUALLY");
            assertThat(itemProperties.path("explanation").path("maxLength").asInt()).isEqualTo(240);
            assertThat(itemProperties.path("documentEvidence").path("maxLength").asInt()).isEqualTo(780);
            assertThat(properties.path("verifiedChecks").path("maxItems").asInt()).isEqualTo(5);
            assertThat(properties.path("findings").path("maxItems").asInt()).isEqualTo(8);
        }
    }

    @Test void parsesExtendedRecordedNotesWithTheCompactWireSchema() throws Exception {
        for (int count : new int[]{9, 50}) {
            setup();
            var note = Map.of("issue", "Verify the graphical artifact in the PDF.",
                "source", "DOCUMENT", "evidence", "Artifact label", "requirement", "");
            String report = json.writeValueAsString(Map.of("summary", "Manual verification is needed.",
                "findings", List.of(), "missingRequiredSections", List.of(), "suggestedAction", "",
                "verifiedChecks", List.of(), "verificationNotes", java.util.Collections.nCopies(count, note)));
            server.expect(requestTo(GENERATE))
                .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verificationNotes").doesNotExist())
                .andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));
            assertThat(provider.review(input()).verificationNotes()).hasSize(count);
            server.verify();
        }
    }

    @Test void rejectsVerificationNotesBeyondTheLegacyParserLimit() throws Exception {
        var note = Map.of("issue", "Verify the artifact.", "source", "DOCUMENT",
            "evidence", "Artifact label", "requirement", "");
        String report = json.writeValueAsString(Map.of("summary", "Manual verification is needed.",
            "findings", List.of(), "missingRequiredSections", List.of(), "suggestedAction", "",
            "verifiedChecks", List.of(), "verificationNotes", java.util.Collections.nCopies(51, note)));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input())).isInstanceOf(GeminiAiReviewProvider.Failure.class);
        server.verify();
    }


    @Test void schemaRejectionHasFixedDiagnosticsAndDoesNotRetry() throws Exception {
        String privateText = "private-test-key and submitted-file-name";
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.APPLICATION_JSON)
            .body(json.writeValueAsString(Map.of("error", Map.of("message",
                "responseJsonSchema has too many states: " + privateText)))));
        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("REQUEST_SCHEMA_REJECTED");
                assertThat(failure.detail).isEqualTo("SCHEMA_TOO_COMPLEX");
                assertThat(failure).hasNoCause();
                assertThat(failure.toString()).doesNotContain(privateText);
                assertThat(failure.diagnostic).isNotNull();
                assertThat(failure.diagnostic.reasonCode()).isEqualTo("SCHEMA_TOO_COMPLEX");
                assertThat(failure.diagnostic.explanation()).contains("supported schema complexity limits");
                assertThat(failure.diagnostic.parameterFields()).contains("responseJsonSchema");
                assertThat(failure.diagnostic.explanation()).doesNotContain(privateText);
            });
        server.verify();
    }

    @Test void schemaFieldAloneDoesNotClaimComplexity() throws Exception {
        String privateEcho = "schema property \"prompt phrase\" api-key https://private.example/x";
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.APPLICATION_JSON)
            .body(json.writeValueAsString(Map.of("error", Map.of("message", privateEcho,
                "details", List.of(Map.of("fieldViolations",
                    List.of(Map.of("field", "generationConfig.responseJsonSchema.properties.items.type",
                        "description", privateEcho)))))))));
        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("REQUEST_SCHEMA_REJECTED");
                assertThat(failure.diagnostic.reasonCode()).isEqualTo("REQUEST_SCHEMA_REJECTED");
                assertThat(failure.diagnostic.explanation()).contains("did not establish a more specific")
                    .doesNotContain("prompt phrase", "api-key", "private.example");
            });
        server.verify();
    }

    @Test void maxOutputTokenFieldAloneDoesNotClaimAnUpperLimit() throws Exception {
        String privateEcho = "unsupported negative option \"prompt phrase\" api-key https://private.example/x";
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.APPLICATION_JSON)
            .body(json.writeValueAsString(Map.of("error", Map.of("message", privateEcho,
                "details", List.of(Map.of("fieldViolations",
                    List.of(Map.of("field", "generationConfig.maxOutputTokens", "description", privateEcho)))))))));
        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("REQUEST_PARAMETER_REJECTED");
                assertThat(failure.diagnostic.reasonCode()).isEqualTo("REQUEST_PARAMETER_REJECTED");
                assertThat(failure.diagnostic.explanation()).contains("did not establish a numeric upper-limit cause")
                    .doesNotContain("prompt phrase", "api-key", "private.example");
            });
        server.verify();
    }

    @Test void lowerBoundAndRangeTextDoNotBecomeUpperLimitClaims() throws Exception {
        for (String message : List.of("maxOutputTokens must be at least 1",
                "maxOutputTokens must be between 1 and 65536")) {
            setup();
            server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.APPLICATION_JSON)
                .body(json.writeValueAsString(Map.of("error", Map.of("message", message)))));
            assertThatThrownBy(() -> provider.review(input()))
                .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                    assertThat(failure.code).isEqualTo("REQUEST_PARAMETER_REJECTED");
                    assertThat(failure.diagnostic.reasonCode()).isEqualTo("REQUEST_PARAMETER_REJECTED");
                    assertThat(failure.diagnostic.explanation()).contains("did not establish a numeric upper-limit cause")
                        .doesNotContain("allowed limit of");
                });
            server.verify();
        }
    }

    @Test void knownTokenLimitRetainsOnlyTheSafeLimitAndAllowlistedField() throws Exception {
        String secretEcho = "AIzaFAKE secret@example.com https://private.example/doc \"prompt excerpt\"";
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
            .contentType(MediaType.APPLICATION_JSON)
            .body(json.writeValueAsString(Map.of("error", Map.of("message",
                "maxOutputTokens must be <= 2048; " + secretEcho)))));
        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("REQUEST_PARAMETER_REJECTED");
                assertThat(failure.diagnostic.reasonCode()).isEqualTo("OUTPUT_TOKEN_LIMIT_EXCEEDED");
                assertThat(failure.diagnostic.parameterFields()).contains("generationConfig.maxOutputTokens");
                assertThat(failure.diagnostic.explanation()).contains("2048")
                    .doesNotContain("AIza", "secret@example.com", "private.example", "prompt excerpt");
            });
        server.verify();
    }

    @Test void unspecifiedBadRequestRemainsGenericAndDoesNotLeakTheBody() {
        server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
            .body("private invalid request"));
        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("REQUEST_REJECTED");
                assertThat(failure.detail).isEqualTo("http_400");
                assertThat(failure).hasNoCause();
                assertThat(failure.toString()).doesNotContain("private");
            });
        server.verify();
    }

    @Test void badRequestDiagnosticsUseFixedLabelsForProviderDetails() throws Exception {
        String privateText = "private-key and submitted-document-text";
        var cases = List.of(
            List.of(Map.of("message", privateText, "details", List.of(Map.of("reason", "API_KEY_INVALID"))),
                "API_KEY_REJECTED", "api_key"),
            List.of(Map.of("message", privateText, "details", List.of(Map.of("fieldViolations",
                List.of(Map.of("field", "generation_config.thinking_config.thinking_level", "description", privateText))))),
                "REQUEST_PARAMETER_REJECTED", "thinking_config"),
            List.of(Map.of("message", "Unsupported generationConfig: " + privateText),
                "REQUEST_PARAMETER_REJECTED", "generation_config"),
            List.of(Map.of("message", "Unable to process the PDF: " + privateText),
                "REQUEST_DOCUMENT_REJECTED", "pdf_input"),
            List.of(Map.of("message", privateText, "status", "INVALID_ARGUMENT"),
                "REQUEST_REJECTED", "invalid_argument"),
            List.of(Map.of("message", privateText, "status", "FAILED_PRECONDITION"),
                "REQUEST_REJECTED", "failed_precondition"));
        for (var example : cases) {
            setup();
            server.expect(requestTo(GENERATE)).andRespond(withStatus(HttpStatus.BAD_REQUEST)
                .contentType(MediaType.APPLICATION_JSON).body(json.writeValueAsString(Map.of("error", example.get(0)))));
            assertThatThrownBy(() -> provider.review(input()))
                .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                    assertThat(failure.code).isEqualTo(example.get(1));
                    assertThat(failure.detail).isEqualTo(example.get(2));
                    assertThat(failure).hasNoCause();
                    assertThat(failure.toString()).doesNotContain(privateText);
                    assertThat(failure.diagnostic).isNotNull();
                    assertThat(failure.diagnostic.explanation()).doesNotContain(privateText);
                    if ("thinking_config".equals(example.get(2))) {
                        assertThat(failure.diagnostic.parameterFields()).contains("generationConfig.thinkingConfig");
                    }
                });
            server.verify();
        }
    }

    @Test void sendsOnePdfWithBoundedStructuredOutputAndNoDuplicatedText() throws Exception {
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST))
            .andExpect(header("x-goog-api-key", "test-key"))
            .andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingLevel").value("MINIMAL"))
            .andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingBudget").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.temperature").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.candidateCount").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.maxOutputTokens").value(8192))
            .andExpect(jsonPath("$.generationConfig.responseMimeType").value("application/json"))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.required.length()").value(7))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.required").value(org.hamcrest.Matchers.hasItem("documentOverview")))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.required").value(org.hamcrest.Matchers.hasItem("verifiedChecks")))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.required").value(org.hamcrest.Matchers.hasItem("criterionReviews")))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.findings.items.properties.source.enum.length()").value(3))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.missingRequiredSections.items.properties.source.enum.length()").value(2))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.maxItems").value(5))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.minItems").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.items.anyOf").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.items.required.length()").value(3))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.items.properties.source").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.items.properties.passageId.enum[0]").value(""))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.length()").value(7))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.findings.items.properties.length()").value(4))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.findings.items.properties.location").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.findings.items.properties.title").doesNotExist())
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.findings.items.properties.nextAction").doesNotExist())
            .andExpect(jsonPath("$.contents[0].parts[1].inlineData.mimeType").value("application/pdf"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("hasOfficialTemplate")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("hasDeliverableInstructions")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("sample project names")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("internal contradictions")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("concrete missing item")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Always include the verifiedChecks array.")))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("DO NOT SEND THIS DUPLICATE TEXT"))))
            .andRespond(withSuccess(validResponse(), MediaType.APPLICATION_JSON));
        var result = provider.review(input());
        assertThat(result.findings()).hasSize(1);
        assertThat(result.findings().get(0).source()).isEqualTo(AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS);
        assertThat(result.missingRequiredSections()).isEmpty();
        assertThat(result.verifiedChecks()).isEmpty();
        assertThat(result.limitations()).isEmpty();
        assertThat(provider.cacheVersion()).contains("gemini-3.5-flash-lite", "rest-pdf-v7", "thinking-minimal", "output-8192",
            "schema-structured-review-v12-instruction-assessments");
        assertThat(provider.cacheVersion()).doesNotContain("temperature-0.2");
        server.verify();
    }

    @Test void directBodyCitationsCanUseEvidenceOutsideTheSuggestedPassages() throws Exception {
        var paragraphs = java.util.stream.IntStream.rangeClosed(1, 35).mapToObj(i ->
            "The request registrar in unit " + i + " records the applicant identifier and preserves its original submission. "
            + "Authorized staff can inspect that stored application before recording a decision for the applicant.").toList();
        String text = java.util.stream.IntStream.range(0, paragraphs.size()).mapToObj(i ->
            (i + 1) + ". Registration unit " + (i + 1) + "\n" + paragraphs.get(i)).collect(java.util.stream.Collectors.joining("\n"));
        var suggested = AiReviewGroundingPolicy.positiveEvidencePassages(text);
        String quote = paragraphs.stream().filter(p -> suggested.stream().noneMatch(s -> s.contains(p))).findFirst().orElseThrow();
        String label = quote.substring(0, quote.indexOf(" records"));
        var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), text,
            "Instructor review only", "SRS", "Describe the request registrar.", "");
        var checks = List.of(Map.of("aspect", "Invented cloud deployment", "passageId", "", "documentEvidence", quote),
            Map.of("aspect", label, "passageId", "", "documentEvidence", quote));
        var mapping = Map.of("criterionId", "C1", "verifiedCheckIndexes", List.of(1), "findingIndexes", List.of(),
            "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of());
        String body = json.writeValueAsString(Map.of("summary", "Review", "findings", List.of(),
            "missingRequiredSections", List.of(), "suggestedAction", "Inspect", "verifiedChecks", checks,
            "criterionReviews", List.of(mapping)));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(body, "STOP"), MediaType.APPLICATION_JSON));
        var parsed = provider.review(request);
        assertThat(parsed.verifiedChecks()).hasSize(1);
        assertThat(parsed.verifiedChecks().getFirst().documentEvidence()).isEqualTo(quote);
        assertThat(parsed.coverage().criteria().getFirst().verifiedCheckIndexes()).containsExactly(0);
        var grounded = AiReviewService.postprocessForBenchmark(parsed, request.deliverableTitle(), request.instructions(), "", text);
        assertThat(grounded.verifiedChecks()).hasSize(1);
        assertThat(grounded.coverage().criteria().getFirst().status()).isEqualTo(AiReviewProvider.CoverageStatus.EVIDENCE_RECORDED);
        server.verify();
    }

    @Test void inventedOrFrontMatterBodyCitationsCannotCreateObservations() throws Exception {
        String quote = "The registrar retains the submitted application and records an authorized staff decision.";
        String text = "Software Requirements Specification\nPrepared by the project team\n1. Purpose\n" + quote;
        var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), text,
            "Instructor review only", "SRS", "", "");
        var checks = List.of(
            Map.of("aspect", "cloud deployment", "passageId", "", "documentEvidence", "The cloud deployment uses a private cluster."),
            Map.of("aspect", "Prepared by", "passageId", "", "documentEvidence", "Prepared by the project team"),
            Map.of("aspect", "All requirements are satisfied", "passageId", "", "documentEvidence", quote));
        String body = json.writeValueAsString(Map.of("summary", "Review", "findings", List.of(),
            "missingRequiredSections", List.of(), "suggestedAction", "Inspect", "verifiedChecks", checks,
            "criterionReviews", List.of()));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(body, "STOP"), MediaType.APPLICATION_JSON));
        assertThat(provider.review(request).verifiedChecks()).isEmpty();
        server.verify();
    }

    @Test void coverageReferencesFollowTheChecksThatSurvivedProviderParsing() throws Exception {
        String text = "1. Registration purpose\nThe registration service records applications and sends them to authorized staff for a decision."
            + " The staff view retains the original application so reviewers can inspect the submitted information.";
        var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), text,
            "Instructor review only", "SRS", "Describe the registration purpose.", "");
        var checks = List.of(Map.of("aspect", "Invented cloud deployment", "passageId", "P1"),
            Map.of("aspect", "registration service records applications", "passageId", "P1"));
        var mapping = Map.of("criterionId", "C1", "verifiedCheckIndexes", List.of(1), "findingIndexes", List.of(),
            "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of());
        String body = json.writeValueAsString(Map.of("summary", "Review", "findings", List.of(),
            "missingRequiredSections", List.of(), "suggestedAction", "Inspect", "verifiedChecks", checks,
            "criterionReviews", List.of(mapping)));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(body, "STOP"), MediaType.APPLICATION_JSON));
        var parsed = provider.review(request);
        assertThat(parsed.verifiedChecks()).hasSize(1);
        assertThat(parsed.coverage().criteria().getFirst().verifiedCheckIndexes()).containsExactly(0);
        var grounded = AiReviewService.postprocessForBenchmark(parsed, request.deliverableTitle(), request.instructions(), "", text);
        assertThat(grounded.coverage().criteria().getFirst().status()).isEqualTo(AiReviewProvider.CoverageStatus.EVIDENCE_RECORDED);
        server.verify();
    }

    @Test void malformedOrDuplicateWireMappingsLeaveAreasUnchecked() throws Exception {
        String text = "1. Registration purpose\nThe registration service records applications and sends them to authorized staff for a decision."
            + " The staff view retains the original application so reviewers can inspect the submitted information.";
        var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), text,
            "Instructor review only", "SRS", "Describe the registration purpose.", "");
        var valid = Map.of("criterionId", "C1", "verifiedCheckIndexes", List.of(0), "findingIndexes", List.of(),
            "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of());
        for (var mappings : List.of(List.of(valid, valid),
                List.of(Map.of("criterionId", "C99", "verifiedCheckIndexes", List.of(0), "findingIndexes", List.of(),
                    "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of())),
                List.of(Map.of("criterionId", "C1", "verifiedCheckIndexes", List.of(0, 0), "findingIndexes", List.of(),
                    "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of())),
                List.of(Map.of("criterionId", "C1", "verifiedCheckIndexes", List.of(0, 9), "findingIndexes", List.of(),
                    "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of())),
                List.of(Map.of("criterionId", "C1", "verifiedCheckIndexes", List.of(0), "findingIndexes", List.of(49),
                    "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of())))) {
            setup();
            String body = json.writeValueAsString(Map.of("summary", "Review", "findings", List.of(),
                "missingRequiredSections", List.of(), "suggestedAction", "Inspect",
                "verifiedChecks", List.of(Map.of("aspect", "registration service records applications", "passageId", "P1")),
                "criterionReviews", mappings));
            server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(body, "STOP"), MediaType.APPLICATION_JSON));
            var grounded = AiReviewService.postprocessForBenchmark(provider.review(request), "SRS", request.instructions(), "", text);
            assertThat(grounded.verifiedChecks()).hasSize(1);
            assertThat(grounded.coverage().criteria().getFirst().status()).isEqualTo(AiReviewProvider.CoverageStatus.NOT_CHECKED);
            server.verify();
        }
    }

    @Test void parsesOptionalFindingGuidanceLocationsAndVerificationNotes() throws Exception {
        String report = "{\"summary\":\"A grounded issue was found.\",\"findings\":[{\"issue\":\"R1 is unclear.\",\"source\":\"DELIVERABLE_REQUIREMENTS\",\"evidence\":\"Page 4: R1 text\",\"requirement\":\"Include functional requirements\",\"title\":\"Clarify R1\",\"nextAction\":\"Add a measurable threshold.\",\"location\":{\"page\":4,\"section\":\"Functional requirements\"}}],\"missingRequiredSections\":[],\"suggestedAction\":\"Review R1.\",\"verifiedChecks\":[],\"verificationNotes\":[{\"issue\":\"The heading location needs confirmation.\",\"source\":\"DOCUMENT\",\"evidence\":\"Page 4: R1 text\",\"requirement\":\"\",\"title\":\"Verify in PDF\",\"nextAction\":\"Open the original PDF.\",\"location\":{\"page\":4}}]}";
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));
        var result = provider.review(input());
        assertThat(result.findings().get(0).title()).isEqualTo("Clarify R1");
        assertThat(result.findings().get(0).nextAction()).contains("measurable");
        assertThat(result.findings().get(0).location()).isEqualTo(new AiReviewProvider.EvidenceLocation(4, "Functional requirements"));
        assertThat(result.verificationNotes()).hasSize(1);
        assertThat(result.verificationNotes().get(0).location().page()).isEqualTo(4);
    }

    @Test void allowsDevelopmentHarnessToRaiseOutputLimitWithoutChangingProductionDefault() throws Exception {
        var highProvider = new GeminiAiReviewProvider("test-key", client, json, 0, "HIGH", 16_384);
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST))
            .andExpect(jsonPath("$.generationConfig.thinkingConfig.thinkingLevel").value("HIGH"))
            .andExpect(jsonPath("$.generationConfig.maxOutputTokens").value(16_384))
            .andRespond(withSuccess(validResponse(), MediaType.APPLICATION_JSON));

        highProvider.review(input());

        assertThat(highProvider.cacheVersion()).contains("thinking-high", "output-16384");
        server.verify();
    }

    @Test void noTemplateIsExplicitInputStateAndProducesDeterministicReviewLimit() throws Exception {
        var noTemplate = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), "duplicate",
            "Instructor review only", "Refactored SPMP", "", "");
        String report = response("{\"summary\":\"The PDF identifies itself as an Individual Problem Exploration report rather than the requested Refactored SPMP.\",\"findings\":[{\"issue\":\"The submitted PDF identifies itself as Individual Problem Exploration.\",\"source\":\"DOCUMENT\",\"evidence\":\"Page 1: Part A: Individual Problem Exploration\",\"requirement\":\"\"}],\"missingRequiredSections\":[],\"suggestedAction\":\"Verify that the correct Refactored SPMP file was submitted.\",\"verifiedChecks\":[]}", "STOP");
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

    @Test void malformedProviderEnvelopeIsNotReportedAsLostConnection() {
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(
            "{\"candidates\":[private-provider-content", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("INVALID_RESPONSE");
                assertThat(failure).hasNoCause();
                assertThat(failure.toString()).doesNotContain("private-provider-content");
            });
        server.verify();
    }

    @Test void unexpectedProviderContentTypeIsNotReportedAsLostConnection() {
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(
            "<html>private-provider-content</html>", MediaType.TEXT_HTML));
        assertThatThrownBy(() -> provider.review(input()))
            .hasMessage("INVALID_RESPONSE").hasNoCause();
        server.verify();
    }

    @Test void nestedJdkTimeoutDoesNotRetryOrLeakTheCause() {
        server.expect(requestTo(GENERATE)).andRespond(withException(new java.io.IOException(
            "private-provider-content", new java.net.http.HttpTimeoutException("private-provider-content"))));
        assertThatThrownBy(() -> provider.review(input())).hasMessage("PROVIDER_TIMEOUT").hasNoCause();
        server.verify();
    }

    @Test void connectionLostWhileReadingJsonRemainsAConnectionFailure() {
        server.expect(requestTo(GENERATE)).andRespond(request -> {
            var reply = new org.springframework.mock.http.client.MockClientHttpResponse(new java.io.InputStream() {
                private final byte[] prefix = "{\"candidates\":[{\"content\":{".getBytes(StandardCharsets.UTF_8);
                private int position;
                @Override public int read() throws java.io.IOException {
                    if (position < prefix.length) return prefix[position++] & 0xff;
                    throw new java.net.SocketException("private-provider-content");
                }
            }, HttpStatus.OK);
            reply.getHeaders().setContentType(MediaType.APPLICATION_JSON);
            return reply;
        });
        assertThatThrownBy(() -> provider.review(input()))
            .hasMessage("PROVIDER_CONNECTION_FAILED").hasNoCause();
        server.verify();
    }

    @Test
    @org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
    void resetConnectionDoesNotRetryOrLeakTheCause(org.springframework.boot.test.system.CapturedOutput output) {
        server.expect(requestTo(GENERATE)).andRespond(withException(
            new java.net.SocketException("private-provider-content")));
        assertThatThrownBy(() -> provider.review(input()))
            .hasMessage("PROVIDER_CONNECTION_FAILED").hasNoCause();
        assertThat(output.toString()).contains("stage=generation", "elapsedMs=", "code=PROVIDER_CONNECTION_FAILED",
            "SocketException").doesNotContain("private-provider-content");
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

    @Test void rejectsMissingVerifiedChecksInFreshGenerationWithoutRetry() throws Exception {
        String report = json.writeValueAsString(Map.of("summary", "Available evidence is insufficient.",
            "findings", List.of(), "missingRequiredSections", List.of(), "suggestedAction", "Inspect the PDF manually."));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> provider.review(input()))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class, failure -> {
                assertThat(failure.code).isEqualTo("INVALID_RESPONSE");
                assertThat(failure.detail).isEqualTo("missing_verifiedChecks_array");
            });
        server.verify();
    }

    @Test void acceptsExplicitlyEmptyVerifiedChecksWhenNoEvidenceIsAvailable() throws Exception {
        String report = json.writeValueAsString(Map.of("summary", "Available evidence is insufficient.",
            "findings", List.of(), "missingRequiredSections", List.of(), "suggestedAction", "Inspect the PDF manually.",
            "verifiedChecks", List.of()));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));

        var result = provider.review(input());
        assertThat(result.findings()).isEmpty();
        assertThat(result.missingRequiredSections()).isEmpty();
        assertThat(result.verifiedChecks()).isEmpty();
        server.verify();
    }

    @Test void parsesNarrowPositiveChecksWithDocumentAndAuthorityEvidence() throws Exception {
        var documentCheck = Map.of("aspect", "Section 2.1 describes the project scope", "source", "DOCUMENT",
            "documentEvidence", "The system supports account registration and role-specific access.", "requirement", "");
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

    @Test void sourceReferencesPreserveWrappedBodyContextAndExcludeMismatchedLabels() throws Exception {
        String scope = "The application checks the submitted PDF against configured sub-";
        String continuation = "mission rules and preserves the response that staff use to give feedback.";
        String feedback = "The feedback view separates recorded issues from an instructor's final academic decision.";
        String document = "1. Scope\n" + scope + "\n" + continuation + "\n2. Feedback\n" + feedback;
        var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), document,
            "Instructor review only", "SRS", "", "");
        String fullScope = scope + "\n" + continuation;
        var checks = List.of(Map.of("aspect", "oversized ".repeat(25), "passageId", "P1"),
            Map.of("aspect", "Unrelated processor hardware specifications", "passageId", "P1"),
            Map.of("aspect", "The application checks the submitted PDF", "passageId", "P1"),
            Map.of("aspect", "The feedback view separates recorded issues", "passageId", "P2"));
        String report = json.writeValueAsString(Map.of("summary", "Observed passages", "findings", List.of(),
            "missingRequiredSections", List.of(), "suggestedAction", "Review", "verifiedChecks", checks));
        server.expect(requestTo(GENERATE))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.maxItems").value(5))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.items.properties.passageId.enum.length()").value(3))
            .andExpect(jsonPath("$.generationConfig.responseJsonSchema.properties.verifiedChecks.items.properties.documentEvidence.maxLength").value(780))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("positiveEvidencePassages")))
            .andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));

        var grounded = AiReviewService.postprocessForBenchmark(provider.review(request), "SRS", "", "", document);

        assertThat(grounded.verifiedChecks()).extracting(AiReviewProvider.VerifiedCheck::documentEvidence)
            .containsExactly("1. Scope\n" + fullScope, "2. Feedback\n" + feedback);
        assertThat(grounded.verifiedChecks()).extracting(AiReviewProvider.VerifiedCheck::aspect)
            .doesNotContain("Unrelated processor hardware specifications");
        assertThat(grounded.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
        server.verify();
    }


    @Test void redundantPassageQuotationUsesTheVerifiedServerPassage() throws Exception {
        String quote = "The registration service records applications and sends them to authorized staff for a decision.";
        String text = "1. Registration purpose\n" + quote
            + " The staff view retains the original application so reviewers can inspect the submitted information.";
        var passages = AiReviewGroundingPolicy.positiveEvidencePassages(text);
        assertThat(passages).hasSize(1);
        for (String redundantQuote : List.of(quote, quote.toUpperCase(java.util.Locale.ROOT), quote.replace(" ", "\n"))) {
            setup();
            var check = Map.of("aspect", "registration service records applications", "passageId", "P1",
                "documentEvidence", redundantQuote);
            String body = json.writeValueAsString(Map.of("summary", "Review", "findings", List.of(),
                "missingRequiredSections", List.of(), "suggestedAction", "Inspect", "verifiedChecks", List.of(check)));
            server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(body, "STOP"), MediaType.APPLICATION_JSON));
            var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), text,
                "Instructor review only", "SRS", "Describe the registration purpose.", "");
            var parsed = provider.review(request);
            assertThat(parsed.verifiedChecks()).hasSize(1);
            assertThat(parsed.verifiedChecks().getFirst().documentEvidence()).isEqualTo(passages.getFirst());
            assertThat(parsed.verifiedChecks().getFirst().source()).isEqualTo(AiReviewProvider.FindingSource.DOCUMENT);
            assertThat(parsed.verifiedChecks().getFirst().requirement()).isEmpty();
            server.verify();
        }
    }

    @Test void conflictingMixedCitationsDoNotDiscardIndependentEvidenceOrMisalignCoverage() throws Exception {
        String text = "1. Registration purpose\nThe registration service records applications and sends them to authorized staff for a decision."
            + " The staff view retains the original application so reviewers can inspect the submitted information.";
        var valid = Map.of("aspect", "registration service records applications", "passageId", "P1", "documentEvidence", "");
        for (var invalid : List.of(
                Map.of("aspect", "registration service records applications", "passageId", "P1", "documentEvidence", "Invented cloud deployment"),
                Map.of("aspect", "registration service records applications", "passageId", "P1", "documentEvidence", 42),
                Map.of("aspect", "registration service records applications", "passageId", "P1", "source", "OFFICIAL_TEMPLATE"),
                Map.of("aspect", "registration service records applications", "passageId", "P1", "requirement", "Invented mandatory certification"))) {
            setup();
            var mapping = Map.of("criterionId", "C1", "verifiedCheckIndexes", List.of(0, 1), "findingIndexes", List.of(),
                "missingSectionIndexes", List.of(), "verificationNoteIndexes", List.of());
            String body = json.writeValueAsString(Map.of("summary", "Review", "findings", List.of(),
                "missingRequiredSections", List.of(), "suggestedAction", "Inspect", "verifiedChecks", List.of(invalid, valid),
                "criterionReviews", List.of(mapping)));
            server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(body, "STOP"), MediaType.APPLICATION_JSON));
            var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), text,
                "Instructor review only", "SRS", "Describe the registration purpose.", "");
            var parsed = provider.review(request);
            assertThat(parsed.verifiedChecks()).hasSize(1);
            assertThat(parsed.coverage().criteria().getFirst().verifiedCheckIndexes()).containsExactly(0);
            assertThat(parsed.verifiedChecks().getFirst().requirement()).isEmpty();
            server.verify();
        }
    }

    @Test void rejectingTheOnlyConflictingCitationCannotBecomeACleanReview() throws Exception {
        String text = "1. Registration purpose\nThe registration service records applications and sends them to authorized staff for a decision."
            + " The staff view retains the original application so reviewers can inspect the submitted information.";
        var invalid = Map.of("aspect", "registration service records applications", "passageId", "P1",
            "documentEvidence", "Invented cloud deployment");
        String body = json.writeValueAsString(Map.of("summary", "Approved", "findings", List.of(),
            "missingRequiredSections", List.of(), "suggestedAction", "Approve", "verifiedChecks", List.of(invalid)));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(body, "STOP"), MediaType.APPLICATION_JSON));
        var request = new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8), text,
            "Instructor review only", "SRS", "", "");
        var parsed = provider.review(request);
        assertThat(parsed.verifiedChecks()).isEmpty();
        var grounded = AiReviewService.postprocessForBenchmark(parsed, "SRS", "", "", text);
        assertThat(grounded.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
        server.verify();
    }

    @Test void unknownOrMixedReferencesCannotCreateDocumentEvidence() throws Exception {
        for (var check : List.of(Map.of("aspect", "Unknown passage", "passageId", "P1"),
                Map.of("aspect", "Invalid passage", "passageId", "P99"),
                Map.of("aspect", "Mixed contracts", "passageId", "P1", "source", "OFFICIAL_TEMPLATE"))) {
            setup();
            String report = json.writeValueAsString(Map.of("summary", "Observed passages", "findings", List.of(),
                "missingRequiredSections", List.of(), "suggestedAction", "Review", "verifiedChecks", List.of(check)));
            server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));
            var request = check.containsKey("source")
                ? new AiReviewProvider.Input("claim", "%PDF-test".getBytes(StandardCharsets.UTF_8),
                    "1. Scope\nThe portal records original submitted documents and the instructor's observations before any academic decision is recorded.",
                    "Instructor review only", "SRS", "", "") : input();
            if(check.containsKey("source"))assertThat(provider.review(request).verifiedChecks()).isEmpty();
            else assertThatThrownBy(() -> provider.review(request)).isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
                failure -> assertThat(failure.detail).isEqualTo("unknown_evidence_reference"));
            server.verify();
        }
    }

    @Test void aMixedPositiveCitationCannotDiscardAnIndependentFinding() throws Exception {
        String document="1. Scope\nThe portal records original submitted documents and the instructor's observations before any academic decision is recorded.\n2. Test results\nThe request was denied but the verdict says PASS.";
        var mixed=Map.of("aspect","submitted documents","passageId","P1","documentEvidence","The portal records submitted documents for staff review.");
        var finding=Map.of("issue","The recorded verdict contradicts the actual result.","source","DOCUMENT",
            "evidence","The request was denied but the verdict says PASS.","requirement","");
        String report=json.writeValueAsString(Map.of("summary","A test verdict needs review.","findings",List.of(finding),
            "missingRequiredSections",List.of(),"suggestedAction","Review the verdict.","verifiedChecks",List.of(mixed)));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report,"STOP"),MediaType.APPLICATION_JSON));
        var request=new AiReviewProvider.Input("mixed","%PDF-test".getBytes(StandardCharsets.UTF_8),document,"Review","STD","","");
        var result=provider.review(request);
        assertThat(result.verifiedChecks()).isEmpty();
        assertThat(result.findings()).singleElement().satisfies(f->assertThat(f.evidence()).contains("denied"));
        server.verify();
    }

    @Test void oneUnusablePositiveCheckDoesNotDiscardIndependentVerifiedEvidence() throws Exception {
        String scope = "The system supports account registration and role-specific access.";
        String submission = "The student can submit a PDF for adviser feedback.";
        var invalid = Map.of("aspect", "Invalid obligation", "source", "DOCUMENT",
            "documentEvidence", scope, "requirement", "Invented mandatory certification");
        var scopeCheck = Map.of("aspect", "Account access is described", "source", "DOCUMENT",
            "documentEvidence", scope, "requirement", "");
        var submissionCheck = Map.of("aspect", "PDF submission is described", "source", "DOCUMENT",
            "documentEvidence", submission, "requirement", "");
        String report = json.writeValueAsString(Map.of("summary", "All obligations approved", "findings", List.of(),
            "missingRequiredSections", List.of(), "suggestedAction", "Approve mandatory certification",
            "verifiedChecks", List.of(invalid, scopeCheck, submissionCheck)));
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));

        var raw = provider.review(input());
        assertThat(raw.verifiedChecks().get(0).requirement()).isEqualTo("Invented mandatory certification");
        var grounded = AiReviewService.postprocessForBenchmark(raw, "SRS", "", "", scope + "\n" + submission);

        assertThat(grounded.verifiedChecks()).hasSize(2).allSatisfy(check -> assertThat(check.requirement()).isEmpty());
        assertThat(grounded.verifiedChecks()).extracting(AiReviewProvider.VerifiedCheck::documentEvidence)
            .containsExactly(scope, submission);
        assertThat(grounded.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
        assertThat(grounded.summary()).doesNotContain("approved", "certification");
        assertThat(grounded.suggestedAction()).doesNotContain("certification");
        server.verify();
    }

    @Test void invalidSourceRequirementPairsCannotBecomePositiveEvidence() throws Exception {
        String evidence = "The system supports account registration and role-specific access.";
        var invalidDocument = Map.of("aspect", "Invented obligation", "source", "DOCUMENT",
            "documentEvidence", evidence, "requirement", "Invented mandatory certification");
        var unquotedAuthority = Map.of("aspect", "Unquoted obligation", "source", "OFFICIAL_TEMPLATE",
            "documentEvidence", evidence, "requirement", "");
        for (var check : List.of(invalidDocument, unquotedAuthority)) {
            String report = json.writeValueAsString(Map.of("summary", "Approved", "findings", List.of(),
                "missingRequiredSections", List.of(), "suggestedAction", "Approve", "verifiedChecks", List.of(check)));
            server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));
        }
        for (int attempt = 0; attempt < 2; attempt++) {
            var grounded = AiReviewService.postprocessForBenchmark(provider.review(input()), "SRS", "", "", evidence);
            assertThat(grounded.verifiedChecks()).isEmpty();
            assertThat(grounded.outcome()).isEqualTo(AiReviewProvider.ReviewOutcome.INCONCLUSIVE);
        }
        server.verify();
    }

    @Test void rejectsMalformedVerifiedChecksWithoutInventingPositiveEvidence() throws Exception {
        var valid = Map.of("aspect", "Section 2.1 describes scope", "source", "DOCUMENT",
            "documentEvidence", "The system supports account registration.", "requirement", "");
        var noQuote = Map.of("aspect", "Section 2.1 describes scope", "source", "DOCUMENT",
            "documentEvidence", "", "requirement", "");
        var nonStringRequirement = Map.of("aspect", "Section 3.2 lists functional requirements",
            "source", "OFFICIAL_TEMPLATE", "documentEvidence", "FR-01: The student can submit a PDF.", "requirement", 42);
        var invalidSource = Map.of("aspect", "Section 2.1 describes scope", "source", "UNKNOWN",
            "documentEvidence", "The system supports account registration.", "requirement", "");
        for (Object checks : List.of("not an array", java.util.Collections.nCopies(6, valid),
                List.of(noQuote), List.of(nonStringRequirement), List.of(invalidSource))) {
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
            "missingRequiredSections", missing, "suggestedAction", "Review cited passages.", "verifiedChecks", List.of()));
        assertThat(report.length()).isGreaterThan(30_000).isLessThanOrEqualTo(100_000);
        server.expect(requestTo(GENERATE)).andRespond(withSuccess(response(report, "STOP"), MediaType.APPLICATION_JSON));

        var result = provider.review(input());
        assertThat(result.findings()).hasSize(8);
        assertThat(result.missingRequiredSections()).hasSize(8);
        assertThat(result.findings().get(0).requirement()).hasSize(1_715);
        server.verify();
    }

    @Test void jsonLargerThanBoundIsRejectedEvenIfItsStructureIsOtherwiseValid() throws Exception {
        String report = "{\"summary\":\"Valid summary\",\"findings\":[],\"missingRequiredSections\":[],\"suggestedAction\":\"Valid action\",\"verifiedChecks\":[]}";
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
        String documentOnly = "{\"summary\":\"Document identifies a different deliverable.\",\"findings\":[{\"issue\":\"Different deliverable identity.\",\"source\":\"DOCUMENT\",\"evidence\":\"Page 1: Individual Exploration\"}],\"missingRequiredSections\":[],\"suggestedAction\":\"Verify submitted file.\",\"verifiedChecks\":[]}";
        String unquotedAuthority = "{\"summary\":\"A section is missing.\",\"findings\":[{\"issue\":\"A requirement is unmet.\",\"source\":\"OFFICIAL_TEMPLATE\",\"evidence\":\"Page 2\",\"requirement\":null}],\"missingRequiredSections\":[],\"suggestedAction\":\"Review the source.\",\"verifiedChecks\":[]}";
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
