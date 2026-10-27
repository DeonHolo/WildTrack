package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import com.capvault.backend.template.TemplateInstructionPreparation;
import com.capvault.backend.template.TemplateInstructionProtocol;
import com.capvault.backend.template.TemplateProviderFileStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GeminiInstructionAssessmentTest {
    private static final String ORIGIN = "https://generativelanguage.googleapis.com";
    private static final String GENERATE = ORIGIN + "/v1beta/models/gemini-3.5-flash-lite:generateContent";
    private static final String KEY = "assessment-test-key";
    private static final String TEMPLATE_NAME = "files/retained-template";
    private static final String TEMPLATE_URI = ORIGIN + "/v1beta/" + TEMPLATE_NAME;
    private static final String REQUIREMENT = "Explain named users and their assigned responsibilities.";
    private static final String EVIDENCE = "Students submit deliverables and advisers inspect the received documents.";
    private final ObjectMapper json = new ObjectMapper();
    private final AtomicInteger generations = new AtomicInteger();
    private TemplateProviderFileStore files;
    private MockRestServiceServer server;
    private GeminiAiReviewProvider provider;
    private AiReviewProvider.Input student;
    private TemplateInstructionPreparation.Prepared template;

    @BeforeEach void setUp() throws Exception {
        var builder = RestClient.builder().baseUrl(ORIGIN);
        server = MockRestServiceServer.bindTo(builder).build();
        files = mock(TemplateProviderFileStore.class);
        when(files.find(any(), anyString(), anyString())).thenReturn(Optional.of(new TemplateProviderFileStore.File(
            TEMPLATE_NAME, TEMPLATE_URI, Instant.now().plusSeconds(86_400))));
        provider = new GeminiAiReviewProvider(KEY, builder.build(), json, 0, "MINIMAL", 8192, files);
        byte[] official = pdf("Official project plan template", REQUIREMENT);
        var instruction = new TemplateInstructionPreparation.Instruction("T101", new TemplateInstructionProtocol.Draft(
            "Named users and responsibilities", REQUIREMENT, REQUIREMENT, "Project roles", 1,
            TemplateInstructionProtocol.Applicability.REQUIRED, ""));
        template = new TemplateInstructionPreparation.Prepared(UUID.randomUUID(), AiReviewService.sha256(official),
            official, List.of(instruction));
        byte[] submitted = pdf("Submitted software project plan", EVIDENCE);
        student = new AiReviewProvider.Input("assessment-fixture", submitted, EVIDENCE, "",
            "Software Project Management Plan", "Assess the project plan.", REQUIREMENT);
    }

    @Test void suppliesSeparateTemplateAndSubmissionPdfsWithUnchangedCanonicalInstructionIdentity() throws Exception {
        expectActive();
        expectGeneration(validReport(true), "STOP", true);

        var result = provider.assessInstructions(input(true));

        assertThat(result.coverage().criteria()).hasSize(1);
        var assessment = result.coverage().criteria().getFirst();
        assertThat(assessment.id()).isEqualTo("T101");
        assertThat(assessment.title()).isEqualTo("Named users and responsibilities");
        assertThat(assessment.requirement()).isEqualTo(REQUIREMENT);
        assertThat(assessment.documentEvidence()).isEqualTo(EVIDENCE);
        assertThat(result.documentOverview().text()).contains("software project plan");
        assertThat(generations).hasValue(1);
        verify(files, never()).invalidate(any(), anyString(), anyString());
        server.verify(); // Upload or DELETE of the shared template would be unexpected.
    }

    @Test void laterGroupsUseTheSameFixedInstructionAndReturnNoDuplicateOverview() throws Exception {
        expectActive();
        expectGeneration(validReport(false), "STOP", false);
        var result = provider.assessInstructions(input(false));
        assertThat(result.documentOverview()).isNull();
        assertThat(result.coverage().criteria().getFirst().id()).isEqualTo("T101");
        assertThat(generations).hasValue(1);
        server.verify();
    }

    @Test void aLargeSubmissionUsesItsOwnFilesHandleAndDeletesOnlyThatTemporarySubmission() throws Exception {
        byte[] large;
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            var page = new PDPage();
            document.addPage(page);
            byte[] spaces = new byte[10 * 1024 * 1024];
            java.util.Arrays.fill(spaces, (byte) ' ');
            page.setContents(new PDStream(document, new ByteArrayInputStream(spaces)));
            document.save(output);
            large = output.toByteArray();
        }
        student = new AiReviewProvider.Input(student.idempotencyKey(), large, student.extractedText(), "",
            student.deliverableTitle(), student.instructions(), student.templateText());
        expectActive();
        String submission = ORIGIN + "/v1beta/files/temporary-submission";
        String upload = ORIGIN + "/upload/submission-payload";
        server.expect(requestTo(ORIGIN + "/upload/v1beta/files")).andExpect(method(HttpMethod.POST))
            .andExpect(header("x-goog-api-key", KEY)).andExpect(header("X-Goog-Upload-Protocol", "resumable"))
            .andExpect(header("X-Goog-Upload-Header-Content-Length", Integer.toString(large.length)))
            .andRespond(withSuccess().header("X-Goog-Upload-URL", upload));
        server.expect(requestTo(upload)).andExpect(method(HttpMethod.POST)).andExpect(content().bytes(large))
            .andExpect(header("x-goog-api-key", KEY)).andRespond(withSuccess(json.writeValueAsString(Map.of("file", Map.of(
                "name", "files/temporary-submission", "uri", submission, "state", "ACTIVE"))), MediaType.APPLICATION_JSON));
        expectGeneration(validReport(true), "STOP", true);
        server.expect(requestTo(submission)).andExpect(method(HttpMethod.DELETE)).andExpect(header("x-goog-api-key", KEY))
            .andRespond(withSuccess());

        var result = provider.assessInstructions(input(true));
        assertThat(result.coverage().criteria()).hasSize(1);
        assertThat(generations).hasValue(1);
        server.verify(); // The retained template must not be deleted with the submission.
    }

    @Test void missingInstructionCannotBecomeAnApparentlyCompleteReviewAndDoesNotRepeatGeneration() throws Exception {
        expectActive();
        var incomplete = validReport(true);
        incomplete.putArray("instructionAssessments");
        expectGeneration(incomplete, "STOP", true);
        assertThatThrownBy(() -> provider.assessInstructions(input(true)))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
                failure -> assertThat(failure.code).isEqualTo("INVALID_RESPONSE"));
        assertThat(generations).hasValue(1);
        server.verify();
    }

    @Test void outputLimitDoesNotSaveOrAutomaticallyRepeatAnIncompleteAssessment() throws Exception {
        expectActive();
        expectGeneration(validReport(true), "MAX_TOKENS", true);
        assertThatThrownBy(() -> provider.assessInstructions(input(true)))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
                failure -> assertThat(failure.code).isEqualTo("OUTPUT_TRUNCATED"));
        assertThat(generations).hasValue(1);
        server.verify();
    }

    @Test void aLaterGroupCannotSmuggleAnotherOverviewIntoTheSavedReport() throws Exception {
        expectActive();
        expectGeneration(validReport(true), "STOP", false);
        assertThatThrownBy(() -> provider.assessInstructions(input(false)))
            .isInstanceOfSatisfying(GeminiAiReviewProvider.Failure.class,
                failure -> assertThat(failure.code).isEqualTo("INVALID_RESPONSE"));
        assertThat(generations).hasValue(1);
        server.verify();
    }

    private AiReviewProvider.InstructionInput input(boolean overview) {
        return new AiReviewProvider.InstructionInput(student, template, template.instructions(), overview);
    }

    private void expectActive() throws Exception {
        server.expect(requestTo(TEMPLATE_URI)).andExpect(method(HttpMethod.GET)).andExpect(header("x-goog-api-key", KEY))
            .andRespond(withSuccess(json.writeValueAsString(Map.of("name", TEMPLATE_NAME, "uri", TEMPLATE_URI,
                "state", "ACTIVE", "expirationTime", Instant.now().plusSeconds(86_400).toString())), MediaType.APPLICATION_JSON));
    }

    private void expectGeneration(JsonNode report, String finish, boolean overview) throws Exception {
        server.expect(requestTo(GENERATE)).andExpect(method(HttpMethod.POST)).andExpect(header("x-goog-api-key", KEY))
            .andExpect(request -> {
                generations.incrementAndGet();
                JsonNode body = json.readTree(((MockClientHttpRequest) request).getBodyAsString());
                assertThat(body.path("systemInstruction").path("parts").get(0).path("text").asText())
                    .isEqualTo(AiReviewInstructionProtocol.GUIDANCE);
                JsonNode parts = body.path("contents").get(0).path("parts");
                assertThat(parts.size()).isEqualTo(5);
                assertThat(parts.get(0).path("text").asText()).startsWith("OFFICIAL TEMPLATE PDF");
                assertThat(parts.get(1).path("fileData").path("fileUri").asText()).isEqualTo(TEMPLATE_URI);
                assertThat(parts.get(2).path("text").asText()).startsWith("SUBMITTED STUDENT PDF");
                if (student.pdf().length <= 10 * 1024 * 1024) {
                    assertThat(parts.get(3).path("inlineData").path("mimeType").asText()).isEqualTo("application/pdf");
                    assertThat(Base64.getDecoder().decode(parts.get(3).path("inlineData").path("data").asText()))
                        .containsExactly(student.pdf()).isNotEqualTo(template.pdf());
                } else {
                    assertThat(parts.get(3).path("fileData").path("mimeType").asText()).isEqualTo("application/pdf");
                    assertThat(parts.get(3).path("fileData").path("fileUri").asText())
                        .isEqualTo(ORIGIN + "/v1beta/files/temporary-submission");
                    assertThat(parts.get(3).has("inlineData")).isFalse();
                }
                JsonNode instructions = json.readTree(parts.get(4).path("text").asText());
                assertThat(instructions.path("requestedDeliverable").asText()).isEqualTo(student.deliverableTitle());
                assertThat(instructions.path("includeOverview").asBoolean()).isEqualTo(overview);
                assertThat(instructions.path("instructions").get(0).path("id").asText()).isEqualTo("T101");
                assertThat(instructions.path("instructions").get(0).path("source").path("instruction").asText()).isEqualTo(REQUIREMENT);
                assertThat(body.path("generationConfig").path("maxOutputTokens").asInt()).isEqualTo(8192);
                JsonNode schema = body.path("generationConfig").path("responseJsonSchema");
                assertThat(schema.path("required"))
                    .isEqualTo(json.valueToTree(AiReviewInstructionProtocol.schema()).path("required"));
                assertThat(schema.path("additionalProperties").asBoolean()).isFalse();
                assertThat(schema.toString()).doesNotContain("maxItems", "maxLength", "minimum");
                assertThat(body.toString()).doesNotContain(KEY);
            }).andRespond(withSuccess(json.writeValueAsString(Map.of("candidates", List.of(Map.of("finishReason", finish,
                "content", Map.of("parts", List.of(Map.of("text", report.toString()))))))), MediaType.APPLICATION_JSON));
    }

    private ObjectNode validReport(boolean overview) {
        var report = json.createObjectNode().put("complete", true);
        report.putArray("instructionAssessments").addObject().put("id", "T101").put("assessment", "APPEARS_ADDRESSED")
            .put("explanation", "The plan identifies the two user roles and their tasks.")
            .put("documentEvidence", EVIDENCE).put("page", 1).put("section", "Project roles");
        if (overview) report.putObject("documentOverview").put("text", "This software project plan describes project roles.")
            .put("actualDocumentType", "a software project plan").put("evidence", "Submitted software project plan")
            .put("wrongDocument", false);
        else report.putNull("documentOverview");
        report.putArray("generalFindings");
        return report;
    }

    private byte[] pdf(String title, String body) throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            var page = new PDPage();
            document.addPage(page);
            try (var content = new PDPageContentStream(document, page)) {
                content.beginText(); content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                content.newLineAtOffset(40, 740); content.showText(title);
                content.newLineAtOffset(0, -25); content.showText(body); content.endText();
            }
            document.save(output);
            return output.toByteArray();
        }
    }
}
