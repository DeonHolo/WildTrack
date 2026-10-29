package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import com.capvault.backend.template.TemplateInstructionPreparation;
import com.capvault.backend.template.TemplateInstructionPreparation.Instruction;
import com.capvault.backend.template.TemplateInstructionProtocol.Applicability;
import com.capvault.backend.template.TemplateInstructionProtocol.Draft;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class AiReviewInstructionProtocolTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test void everyCanonicalIdentityIncludingThreeDigitIdsSurvivesGroupedParsing() {
        var all = IntStream.rangeClosed(1, 113).mapToObj(i -> instruction("T" + i, Applicability.REQUIRED)).toList();
        var template = template(all);
        var ids = new ArrayList<String>();
        for (int first = 0; first < all.size(); first += 16) {
            var group = all.subList(first, Math.min(first + 16, all.size()));
            var result = AiReviewInstructionProtocol.parse(response(group, first == 0), template, group, first == 0);
            ids.addAll(result.coverage().criteria().stream().map(CriterionAssessment::id).toList());
            assertThat(result.coverage().omittedCriteria()).isZero();
        }
        assertThat(ids).containsExactlyElementsOf(all.stream().map(Instruction::id).toList());
        assertThat(ids).contains("T100", "T113");
    }

    @Test void sourceWordingAndCasingComeOnlyFromTheSavedInstruction() {
        var source = new Draft("Describe API / SRS scope", "Describe the API roles and project boundaries.",
            "The plan SHALL identify API roles and boundaries.", "1.2 Scope", 4, Applicability.REQUIRED, "");
        var item = new Instruction("T101", source);
        var result = AiReviewInstructionProtocol.parse(response(List.of(item), true), template(List.of(item)), List.of(item), true);
        var row = result.coverage().criteria().getFirst();
        assertThat(row.title()).isEqualTo(source.title());
        assertThat(row.requirement()).isEqualTo(source.instruction());
        assertThat(source.sourceQuote()).isEqualTo("The plan SHALL identify API roles and boundaries.");
        assertThat(row.source()).isEqualTo(FindingSource.OFFICIAL_TEMPLATE);
        assertThat(result.verifiedChecks().getFirst().requirement()).isEqualTo(row.requirement());
        assertThat(row.verifiedCheckIndexes()).containsExactly(0);
    }

    @Test void falseOrMissingCompletionCannotBecomeManualSuccess() {
        var group = List.of(instruction("T1", Applicability.REQUIRED));
        var report = response(group, true);
        report.put("complete", false);
        rejects(report, group, true);
        report.remove("complete");
        rejects(report, group, true);
    }

    @Test void missingDuplicateAndUnknownIdsRejectTheEntireGroup() {
        var group = List.of(instruction("T1", Applicability.REQUIRED), instruction("T100", Applicability.REQUIRED));
        var report = response(group, true);
        report.withArray("instructionAssessments").remove(1);
        rejects(report, group, true);
        report = response(group, true);
        ((ObjectNode) report.withArray("instructionAssessments").get(1)).put("id", "T1");
        rejects(report, group, true);
        report = response(group, true);
        ((ObjectNode) report.withArray("instructionAssessments").get(1)).put("id", "T999");
        rejects(report, group, true);
    }

    @Test void blankAssessmentAndModelWrittenTitleAreRejected() {
        var group = List.of(instruction("T1", Applicability.REQUIRED));
        var report = response(group, true);
        assessment(report).put("explanation", " ");
        rejects(report, group, true);
        report = response(group, true);
        assessment(report).put("title", "Model rewrote the canonical title");
        rejects(report, group, true);
    }

    @Test void optionalAndConditionalItemsMayBeInapplicableButRequiredItemsMayNot() {
        for (var applicability : Applicability.values()) {
            var group = List.of(instruction("T1", applicability));
            var report = response(group, true);
            assessment(report).put("assessment", "NOT_APPLICABLE").put("explanation", "The project does not purchase external services.")
                .put("documentEvidence", "").put("page", 0);
            if (applicability == Applicability.REQUIRED) rejects(report, group, true);
            else assertThat(AiReviewInstructionProtocol.parse(report, template(group), group, true)
                .coverage().criteria().getFirst().assessment()).isEqualTo(CriterionAssessmentLabel.NOT_APPLICABLE);
        }
    }

    @Test void concernAndManualNoteHaveCorrectAuthorityAndIndependentIndexLinks() {
        var group = List.of(instruction("T1", Applicability.REQUIRED), instruction("T2", Applicability.CONDITIONAL));
        var report = response(group, true);
        assessment(report).put("assessment", "NEEDS_ATTENTION").put("explanation", "The cost total conflicts with the itemised amounts.");
        ((ObjectNode) report.withArray("instructionAssessments").get(1)).put("assessment", "CHECK_MANUALLY")
            .put("explanation", "Confirm the diagram labels in the original PDF.");
        var result = AiReviewInstructionProtocol.parse(report, template(group), group, true);
        assertThat(result.findings()).hasSize(1);
        assertThat(result.verificationNotes()).hasSize(1);
        assertThat(result.coverage().criteria().get(0).findingIndexes()).containsExactly(0);
        assertThat(result.coverage().criteria().get(1).verificationNoteIndexes()).containsExactly(0);
        assertThat(result.findings().getFirst().requirement()).isEqualTo(group.getFirst().source().instruction());
        assertThat(result.outcome()).isEqualTo(ReviewOutcome.ISSUES_IDENTIFIED);
    }

    @Test void specificManualExplanationIsRetainedAndBounded() {
        var group = List.of(instruction("T1", Applicability.REQUIRED));
        var report = response(group, true);
        String explanation = "The submission names its users, but their approval responsibilities are unclear. Confirm who approves each request.";
        assessment(report).put("assessment", "CHECK_MANUALLY").put("explanation", explanation);
        var result = AiReviewInstructionProtocol.parse(report, template(group), group, true);
        assertThat(result.coverage().criteria().getFirst().explanation()).isEqualTo(explanation);
        assertThat(result.verificationNotes().getFirst().issue()).isEqualTo(explanation);
        assessment(report).put("explanation", "x".repeat(701));
        rejects(report, group, true);
        assertThat(AiReviewInstructionProtocol.GUIDANCE).contains("one to three short sentences", "four", "specific");
    }

    @Test void addressedAssessmentNeedsEvidenceAndAnAbsolutePage() {
        var group = List.of(instruction("T1", Applicability.REQUIRED));
        var report = response(group, true);
        assessment(report).put("documentEvidence", "");
        rejects(report, group, true);
        report = response(group, true);
        assessment(report).put("page", 0);
        rejects(report, group, true);
        report = response(group, true);
        assessment(report).put("page", -1);
        rejects(report, group, true);
        report = response(group, true);
        assessment(report).put("page", 1.5);
        rejects(report, group, true);
    }

    @Test void firstGroupRequiresOverviewAndLaterGroupsCannotDuplicateIt() {
        var group = List.of(instruction("T1", Applicability.REQUIRED));
        var first = response(group, true);
        first.putNull("documentOverview");
        rejects(first, group, true);
        var later = response(group, true);
        rejects(later, group, false);
        assertThat(AiReviewInstructionProtocol.parse(response(group, false), template(group), group, false).documentOverview()).isNull();
    }

    @Test void firstGroupGeneralFindingsPreserveDeliverableAuthorityAndDocumentSourceRules() {
        var group = List.of(instruction("T1", Applicability.REQUIRED));
        var report = response(group, true);
        var finding = report.withArray("generalFindings").addObject();
        finding.put("issue", "The required evaluation period is not specified.").put("source", "DELIVERABLE_REQUIREMENTS")
            .put("evidence", "Testing will be conducted with intended users.").put("requirement", "State the evaluation period.")
            .put("page", 3).put("section", "Validation");
        var result = AiReviewInstructionProtocol.parse(report, template(group), group, true);
        assertThat(result.findings().getFirst().source()).isEqualTo(FindingSource.DELIVERABLE_REQUIREMENTS);
        assertThat(result.coverage().criteria().getFirst().verifiedCheckIndexes()).containsExactly(0);
        finding.put("source", "DOCUMENT");
        assertThat(AiReviewInstructionProtocol.parse(report, template(group), group, true).findings().getFirst().requirement()).isEmpty();
        finding.put("requirement", "");
        assertThat(AiReviewInstructionProtocol.parse(report, template(group), group, true).findings()).hasSize(1);
        finding.put("source", "OFFICIAL_TEMPLATE");
        rejects(report, group, true);
    }

    @Test void wrongDocumentClaimsAreGroundedLaterWithoutDiscardingTheInstructionAssessment() {
        var group = List.of(instruction("T1", Applicability.REQUIRED));
        var report = response(group, true);
        ((ObjectNode) report.path("documentOverview")).put("wrongDocument", true);
        assertThat(AiReviewInstructionProtocol.parse(report, template(group), group, true).coverage().criteria()).hasSize(1);
        report.withArray("generalFindings").addObject().put("issue", "This is not the required document; it is a reflection.")
            .put("source", "DOCUMENT").put("evidence", "My career reflection.").put("requirement", "").put("page", 1).put("section", "");
        assertThat(AiReviewInstructionProtocol.parse(report, template(group), group, true).documentOverview().wrongDocument()).isTrue();
        ((ObjectNode) report.withArray("generalFindings").get(0)).put("source", "DELIVERABLE_REQUIREMENTS")
            .put("requirement", "Submit the software requirements specification.");
        assertThat(AiReviewInstructionProtocol.parse(report, template(group), group, true).findings().getFirst().source())
            .isEqualTo(FindingSource.DELIVERABLE_REQUIREMENTS);
    }

    @Test void citationFormattingRecoveryRequiresTheSameWordsInTheSubmittedPdf() {
        String source = "Training participants and time\nAll four members attend the planning walkthrough.";
        assertThat(AiReviewInstructionProtocol.citationText("Training participants and time\\nAll four members attend the planning walkthrough.", source))
            .isEqualTo(source);
        assertThat(AiReviewInstructionProtocol.citationText("Training participants\\tand time", source))
            .isEqualTo("Training participants\tand time");
        String invented = "Training participants and time\\nAll five members attend the planning walkthrough.";
        assertThat(AiReviewInstructionProtocol.citationText(invented, source)).isEqualTo(invented);
        String code = "The program prints the literal sequence \\n in the diagnostic output.";
        assertThat(AiReviewInstructionProtocol.citationText(code, code)).isEqualTo(code);
    }

    @Test void emptyTemplateGetsOneOverviewPassWithoutInventedChecklistItems() {
        var report = response(List.of(), true);
        assertThat(AiReviewInstructionProtocol.parse(report, template(List.of()), List.of(), true).coverage().criteria()).isEmpty();
        rejects(response(List.of(), false), List.of(), false);
    }

    @Test void groupBoundIsPerRequestRatherThanAWholeTemplateCutoff() {
        var group = IntStream.rangeClosed(1, 17).mapToObj(i -> instruction("T" + i, Applicability.REQUIRED)).toList();
        rejects(response(group, true), group, true);
        assertThat(AiReviewInstructionProtocol.MAX_GROUP_ITEMS).isEqualTo(16);
    }

    @Test void supportedLongEvidenceAndExplanationAreRetainedWithoutOldSilentClipping() {
        var group = List.of(instruction("T100", Applicability.REQUIRED));
        var report = response(group, true);
        String explanation = "The scope describes named participants and their actions. ".repeat(6).strip();
        String evidence = "The document identifies participants and the steps used to complete the operating task. ".repeat(14).strip();
        assessment(report).put("explanation", explanation).put("documentEvidence", evidence);
        var row = AiReviewInstructionProtocol.parse(report, template(group), group, true).coverage().criteria().getFirst();
        assertThat(row.explanation()).isEqualTo(explanation);
        assertThat(row.documentEvidence()).isEqualTo(evidence);
        assessment(report).put("documentEvidence", "x".repeat(1601));
        rejects(report, group, true);
    }

    private static Instruction instruction(String id, Applicability applicability) {
        return new Instruction(id, new Draft("Describe scope " + id, "Describe scope and operating context for " + id + ".",
            "The document shall describe scope and context for " + id + ".", "1 Scope", 2, applicability,
            applicability == Applicability.CONDITIONAL ? "If external services are used." : ""));
    }
    private static TemplateInstructionPreparation.Prepared template(List<Instruction> all) {
        return new TemplateInstructionPreparation.Prepared(UUID.randomUUID(), "pdf-hash", new byte[] {1}, all);
    }
    private static ObjectNode response(List<Instruction> group, boolean first) {
        var report = JSON.createObjectNode().put("complete", true);
        ArrayNode rows = report.putArray("instructionAssessments");
        for (var item : group) rows.addObject().put("id", item.id()).put("assessment", "APPEARS_ADDRESSED")
            .put("explanation", "The document describes the intended operating context.")
            .put("documentEvidence", "Students submit their project documents and advisers inspect their assigned teams.")
            .put("page", 5).put("section", "Scope");
        if (first) report.putObject("documentOverview").put("text", "This document describes the project plan and its operating context.")
            .put("actualDocumentType", "a project management plan").put("evidence", "Project management plan.").put("wrongDocument", false);
        else report.putNull("documentOverview");
        report.putArray("generalFindings");
        return report;
    }
    private static ObjectNode assessment(ObjectNode report) { return (ObjectNode) report.withArray("instructionAssessments").get(0); }
    private static void rejects(ObjectNode report, List<Instruction> group, boolean overview) {
        assertThatThrownBy(() -> AiReviewInstructionProtocol.parse(report, template(group), group, overview))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
