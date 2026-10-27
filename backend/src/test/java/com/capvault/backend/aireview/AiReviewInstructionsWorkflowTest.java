package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.filecheck.PdfInspection;
import com.capvault.backend.filecheck.PdfInspector;
import com.capvault.backend.template.DocumentTemplateRepository;
import com.capvault.backend.template.DocumentTemplateService;
import com.capvault.backend.template.TemplateInstructionPreparation;
import com.capvault.backend.template.TemplateInstructionPreparation.Instruction;
import com.capvault.backend.template.TemplateInstructionProtocol.Applicability;
import com.capvault.backend.template.TemplateInstructionProtocol.Draft;
import com.capvault.backend.template.TemplateInstructionStore;
import com.capvault.backend.template.TemplateChecklistService;
import com.capvault.backend.template.TemplatePdfPreparation;
import com.capvault.backend.template.TemplatePdfStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:instruction-workflow;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH",
    "capvault.templates.pdf-preparation-enabled=false"
})
class AiReviewInstructionsWorkflowTest {
    private static final UUID WORKSPACE = UUID.fromString("11111111-1111-1111-1111-111111111111");
    @Autowired AiReviewInstructionsWorkflow workflow;
    @Autowired AiReviewStore jobs;
    @Autowired AiReviewPassStore passes;
    @Autowired DocumentTemplateService templateService;
    @Autowired DocumentTemplateRepository templateRepository;
    @Autowired DeliverableRepository deliverables;
    @Autowired TemplatePdfPreparation pdfPreparation;
    @Autowired TemplatePdfStore pdfs;
    @Autowired TemplateInstructionStore instructionStore;
    @Autowired TemplateChecklistService checklists;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate db;
    @MockBean AiReviewProvider provider;

    @BeforeEach void reset() {
        db.update("DELETE FROM ai_review_instruction_passes");
        db.update("DELETE FROM ai_review_response_links");
        db.update("DELETE FROM ai_review_field_links");
        db.update("DELETE FROM ai_review_jobs");
        db.update("DELETE FROM template_provider_files");
        db.update("DELETE FROM template_instruction_sets");
        db.update("DELETE FROM template_checklist_approvals");
        db.update("DELETE FROM template_checklists");
        templateRepository.deleteAll();
        db.update("DELETE FROM academic_document_template_versions");
        deliverables.deleteAll();
        when(provider.isConfigured()).thenReturn(true);
        when(provider.cacheVersion()).thenReturn("instruction-workflow-fixture-v1");
        when(provider.supportsTemplateInstructions()).thenReturn(true);
    }

    @Test void thirtyThreeAndOneHundredThirteenSourceInstructionsSurviveGroundingCheckpointAndMerge() throws Exception {
        for (int count : List.of(33, 113)) {
            var fixture = fixture(count);
            var calls = new AtomicInteger();
            doAnswer(call -> {
                calls.incrementAndGet();
                return response(call.getArgument(0));
            }).when(provider).assessInstructions(any());
            var job = job(fixture);
            var result = run(job, null, fixture);

            assertThat(calls.get()).isEqualTo((count + 15) / 16);
            assertThat(result.coverage().criteria()).hasSize(count);
            assertThat(result.coverage().criteria().stream().map(CriterionAssessment::id).toList())
                .containsExactlyElementsOf(fixture.instructions().stream().map(Instruction::id).toList());
            assertThat(result.coverage().criteria()).allSatisfy(row -> {
                assertThat(row.assessment()).isEqualTo(CriterionAssessmentLabel.APPEARS_ADDRESSED);
                assertThat(row.title()).startsWith("Operating scenario ");
                assertThat(row.documentEvidence()).startsWith("Operating scenario ");
                assertThat(row.verifiedCheckIndexes()).hasSize(1);
                assertThat(result.verifiedChecks().get(row.verifiedCheckIndexes().getFirst()).requirement()).isEqualTo(row.requirement());
            });
            assertThat(result.verifiedChecks()).hasSize(count);
            assertThat(result.coverage().omittedCriteria()).isZero();
            assertThat(result.outcome()).isEqualTo(ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS);
            assertThat(db.queryForObject("SELECT COUNT(*) FROM ai_review_instruction_passes WHERE cache_key = ? AND state = 'COMPLETED'",
                Integer.class, job.key())).isEqualTo((count + 15) / 16);
        }
    }

    @Test void failedThirdPassIsNotAutomaticallyRepeatedAndConfirmedRetryReusesTheFirstTwoPasses() throws Exception {
        var fixture = fixture(33);
        var calls = new AtomicInteger();
        doAnswer(call -> {
            if (calls.incrementAndGet() == 3) throw new GeminiAiReviewProvider.Failure("RATE_LIMITED");
            return response(call.getArgument(0));
        }).when(provider).assessInstructions(any());
        var first = job(fixture);
        assertThatThrownBy(() -> run(first, null, fixture)).isInstanceOf(GeminiAiReviewProvider.Failure.class);
        assertThat(calls.get()).isEqualTo(3);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM ai_review_instruction_passes WHERE cache_key = ? AND state = 'COMPLETED'",
            Integer.class, first.key())).isEqualTo(2);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM ai_review_instruction_passes WHERE cache_key = ? AND state = 'STARTED'",
            Integer.class, first.key())).isEqualTo(1);

        // Re-entering the same attempt cannot replay the ambiguous third paid request.
        assertThatThrownBy(() -> run(first, null, fixture))
            .isInstanceOf(org.springframework.dao.InvalidDataAccessApiUsageException.class)
            .hasMessage("An unfinished paid request requires a confirmed retry.");
        assertThat(calls.get()).isEqualTo(3);
        jobs.uncertain(first, "RATE_LIMITED");
        assertThat(jobs.claim(first.key(), WORKSPACE, fixture.deliverable(), "workflow-team", fixture.documentHash(),
            fixture.contextHash(), null).acquired()).isFalse();
        var retry = jobs.claim(first.key(), WORKSPACE, fixture.deliverable(), "workflow-team", fixture.documentHash(),
            fixture.contextHash(), first.token());
        assertThat(retry.acquired()).isTrue();
        assertThat(retry.job().token()).isNotEqualTo(first.token());
        var result = run(retry.job(), first.token(), fixture);

        assertThat(calls.get()).isEqualTo(4);
        assertThat(result.coverage().criteria()).hasSize(33);
        assertThat(result.coverage().criteria().getLast().id()).isEqualTo("T33");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM ai_review_instruction_passes WHERE cache_key = ? AND run_token = ? AND state = 'COMPLETED'",
            Integer.class, retry.job().key(), retry.job().token())).isEqualTo(3);
    }

    @Test void aSupersededJobCannotStartAnotherPaidPassOrPublishItsCheckpoint() throws Exception {
        var fixture = fixture(17);
        var calls = new AtomicInteger();
        var first = job(fixture);
        doAnswer(call -> {
            calls.incrementAndGet();
            jobs.uncertain(first, "PROVIDER_OUTCOME_UNKNOWN");
            return response(call.getArgument(0));
        }).when(provider).assessInstructions(any());
        assertThatThrownBy(() -> run(first, null, fixture))
            .isInstanceOf(org.springframework.dao.InvalidDataAccessApiUsageException.class)
            .hasMessage("This AI review no longer owns its claim.");
        assertThat(calls.get()).isEqualTo(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM ai_review_instruction_passes WHERE cache_key = ? AND state = 'COMPLETED'",
            Integer.class, first.key())).isZero();
    }

    @Test void unapprovedChecklistStartsNoProviderAssessment() throws Exception {
        var fixture = fixture(3);
        var current = checklists.get(WORKSPACE, fixture.templateId());
        checklists.save(WORKSPACE, fixture.templateId(), current.versionId(), current.revision(), current.items());
        assertThatThrownBy(() -> run(job(fixture), null, fixture))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        org.mockito.Mockito.verify(provider, org.mockito.Mockito.never()).assessInstructions(any());
    }

    @Test void anApprovedInstructionDoesNotNeedToBeAContiguousQuoteInTheOriginalPdf() throws Exception {
        var fixture = fixture(1);
        var current = checklists.get(WORKSPACE, fixture.templateId());
        String instruction = "Describe the operating participants and actions for scenario 1, including the student and adviser responsibilities.";
        var original = current.items().getFirst();
        var edited = new Draft(original.title(), instruction,
            "Software Project Management Plan\n\n" + original.sourceQuote(), original.section(), original.page(), original.applicability(), original.condition());
        var draft = checklists.save(WORKSPACE, fixture.templateId(), current.versionId(), current.revision(), List.of(edited));
        checklists.approve(WORKSPACE, fixture.templateId(), current.versionId(), draft.revision(), "fixture-admin");
        doAnswer(call -> response(call.getArgument(0))).when(provider).assessInstructions(any());
        var result = run(job(fixture), null, fixture);
        assertThat(result.coverage().criteria().getFirst().assessment()).isEqualTo(CriterionAssessmentLabel.APPEARS_ADDRESSED);
        assertThat(result.coverage().criteria().getFirst().requirement()).isEqualTo(instruction);
        assertThat(result.verifiedChecks().getFirst().requirement()).isEqualTo(instruction);
    }

    @Test void checklistEditDuringAssessmentCannotPublishOrStartAnotherPass() throws Exception {
        var fixture = fixture(17);
        var calls = new AtomicInteger();
        doAnswer(call -> {
            calls.incrementAndGet();
            var current = checklists.get(WORKSPACE, fixture.templateId());
            checklists.save(WORKSPACE, fixture.templateId(), current.versionId(), current.revision(), current.items());
            return response(call.getArgument(0));
        }).when(provider).assessInstructions(any());
        var claimed = job(fixture);
        assertThatThrownBy(() -> run(claimed, null, fixture))
            .isInstanceOf(TemplateInstructionPreparation.Failure.class)
            .hasMessageContaining("TEMPLATE_CHECKLIST_CHANGED");
        assertThat(calls.get()).isEqualTo(1);
        assertThat(db.queryForObject("SELECT COUNT(*) FROM ai_review_instruction_passes WHERE cache_key=? AND state='COMPLETED'",
            Integer.class, claimed.key())).isZero();
    }

    private Result run(AiReviewStore.Job job, UUID previous, Fixture fixture) {
        return workflow.review(job, previous, WORKSPACE, fixture.templateId(), fixture.sourceHash(),
            fixture.input(), fixture.inspection(), () -> { });
    }

    private AiReviewStore.Job job(Fixture fixture) {
        return jobs.claim(AiReviewService.sha256(UUID.randomUUID().toString().getBytes(StandardCharsets.UTF_8)), WORKSPACE,
            fixture.deliverable(), "workflow-team", fixture.documentHash(), fixture.contextHash(), null).job();
    }

    private Fixture fixture(int count) throws Exception {
        var instructions = IntStream.rangeClosed(1, count).mapToObj(i -> new Instruction("T" + i,
            new Draft("Operating scenario " + i, authority(i), authority(i), "Operational scenarios", 2 + (i - 1) / 24,
                Applicability.REQUIRED, ""))).toList();
        byte[] official = pdf(instructions.stream().map(i -> i.source().sourceQuote()).toList());
        var saved = templateService.save(WORKSPACE, "WORKFLOW-" + count, "Official plan template",
            new MockMultipartFile("file", "official.pdf", "application/pdf", official));
        pdfPreparation.prepareNext();
        var status = pdfs.current(WORKSPACE, saved.id());
        assertThat(status.state()).isEqualTo("READY");
        var draft = checklists.save(WORKSPACE, saved.id(), status.versionId(), 0,
            instructions.stream().map(Instruction::source).toList());
        checklists.approve(WORKSPACE, saved.id(), status.versionId(), draft.revision(), "fixture-admin");
        byte[] submitted = pdf(IntStream.rangeClosed(1, count).mapToObj(AiReviewInstructionsWorkflowTest::evidence).toList());
        var inspection = new PdfInspector().inspect(submitted);
        assertThat(inspection.readable()).isTrue();
        UUID deliverable = deliverables.saveAndFlush(new Deliverable(WORKSPACE, "WORKFLOW-" + count,
            "Software Project Management Plan", "workflow-" + count, "", LocalDateTime.now(), true,
            DeliverableStatus.PUBLISHED)).getId();
        String documentHash = AiReviewService.sha256(submitted);
        String context = AiReviewService.sha256((saved.sha256() + provider.cacheVersion()).getBytes(StandardCharsets.UTF_8));
        var input = new Input("workflow-fixture", submitted, inspection.extractedText(), AiReviewService.SYSTEM_INSTRUCTION,
            "Software Project Management Plan", "", "");
        return new Fixture(saved.id(), saved.sha256(), deliverable, instructions, input, inspection, documentHash, context);
    }

    private Result response(InstructionInput input) {
        var report = json.createObjectNode().put("complete", true);
        var assessments = report.putArray("instructionAssessments");
        for (var item : input.instructions()) {
            int number = Integer.parseInt(item.id().substring(1));
            assessments.addObject().put("id", item.id()).put("assessment", "APPEARS_ADDRESSED")
                .put("explanation", "The operating scenario identifies its participants and action.")
                .put("documentEvidence", evidence(number)).put("page", 2 + (number - 1) / 24).put("section", "Operational scenarios");
        }
        if (input.includeOverview()) report.putObject("documentOverview")
            .put("text", "This project plan describes the operating scenarios and their participants.")
            .put("actualDocumentType", "a software project management plan").put("wrongDocument", false)
            .put("evidence", "Software Project Management Plan");
        else report.putNull("documentOverview");
        report.putArray("generalFindings");
        return AiReviewInstructionProtocol.parse(report, input.template(), input.instructions(), input.includeOverview());
    }

    private static String authority(int number) { return "Describe the operating participants and actions for scenario " + number + "."; }
    private static String evidence(int number) { return "Operating scenario " + number + " allows students to submit work and advisers to inspect the submitted output."; }
    private static byte[] pdf(List<String> lines) throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            page(document, List.of("Software Project Management Plan", "Project planning information"));
            for (int first = 0; first < lines.size(); first += 24) {
                var content = new ArrayList<String>();
                content.add("1. Operational scenarios");
                content.addAll(lines.subList(first, Math.min(first + 24, lines.size())));
                page(document, content);
            }
            document.save(output);
            return output.toByteArray();
        }
    }
    private static void page(PDDocument document, List<String> lines) throws Exception {
        var page = new PDPage(); document.addPage(page);
        try (var stream = new PDPageContentStream(document, page)) {
            stream.beginText(); stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 9);
            stream.setLeading(20); stream.newLineAtOffset(30, 740);
            for (String line : lines) { stream.showText(line); stream.newLine(); }
            stream.endText();
        }
    }
    private record Fixture(UUID templateId, String sourceHash, UUID deliverable, List<Instruction> instructions,
        Input input, PdfInspection inspection, String documentHash, String contextHash) { }
}
