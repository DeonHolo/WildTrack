package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.capvault.backend.template.TemplateInstructionPreparation;
import com.capvault.backend.template.TemplateInstructionProtocol.Applicability;
import com.fasterxml.jackson.databind.JsonNode;

/** Exact group accounting; source grounding is performed by AiReviewService after parsing. */
public final class AiReviewInstructionProtocol {
    public static final String VERSION = "instruction-assessment-pdf-v4-specific-manual-checks";
    public static final int MAX_GROUP_ITEMS = 16;
    private static final Set<String> TOP = Set.of("complete", "instructionAssessments", "documentOverview", "generalFindings");
    private static final Set<String> ASSESSMENT = Set.of("id", "assessment", "explanation", "documentEvidence", "page", "section");
    private static final Set<String> OVERVIEW = Set.of("text", "actualDocumentType", "evidence", "wrongDocument");
    private static final Set<String> FINDING = Set.of("issue", "source", "evidence", "requirement", "page", "section");

    public static final String GUIDANCE = """
        Review the STUDENT SUBMISSION PDF against the supplied fixed instruction group. The separately
        labelled OFFICIAL TEMPLATE PDF supplies authority and layout context, not student evidence.
        Assess the complete source direction, its following qualifiers and its parent/per-entity scope,
        using the saved source passage and the PDF for context. Do not check only a short title or the
        first sentence, or treat one global example as satisfying a direction for each applicable entity.
        Return exactly one instructionAssessments record for every supplied id, with the id unchanged.
        Never invent, rename, combine or omit an id. complete=true means every supplied id was assessed.
        Only assessment, explanation, documentEvidence, page and section are model-written. Titles,
        instruction wording and authority quotations are fixed by WildTrack; do not return replacements.
        APPEARS_ADDRESSED needs an exact student-PDF quotation supporting that specific instruction.
        NEEDS_ATTENTION describes a concrete supported concern, not merely a heading you did not locate.
        A missing-section claim needs examination of the substantive body, not only its contents page.
        If absence cannot be established reliably, use CHECK_MANUALLY and explain the specific uncertainty.
        For diagrams inspect the PDF images where possible. Do not claim visual correctness from a heading
        or caption alone. Use CHECK_MANUALLY only for a specific unresolved check; never repeat generic
        warnings for each header when there is no distinct concern. Do not copy template examples as facts
        required of the submitted project. Preserve optional and conditional scope. NOT_APPLICABLE is allowed
        only for an OPTIONAL or CONDITIONAL instruction and must explain why it does not apply here.
        Explain each assessment in plain language, usually one to three short sentences and never more
        than four. For CHECK_MANUALLY, say what you could establish from this particular submission,
        what remains uncertain, and what the reviewer should inspect. Do not use a generic statement
        such as "needs manual verification" as the entire assessment or merely repeat the instruction.
        Cite the nearest relevant student passage and its page even if it does not establish that the
        whole instruction is addressed. State uncertainty without asserting an unverified defect.
        Use plain text without decorative emoji. Keep the complete source direction and its qualifiers;
        examples in the template are context, not required project facts. Quote only the student PDF in
        documentEvidence, never the template. page is the absolute PDF page, counting cover and blank pages;
        use 0 only where no supporting passage can be cited, such as an uncertain absence.
        When includeOverview=true, documentOverview describes the actual submission and its main contents
        in two short sentences, without a compliance verdict. Give a short exact identity/purpose quotation.
        wrongDocument=true requires a clear substantive identity mismatch, not different headings or format;
        also include a DOCUMENT generalFinding explaining that it is not the required document. General
        findings are optional and only allowed in that first group. A DOCUMENT finding has empty requirement;
        a DELIVERABLE_REQUIREMENTS finding must quote the exact supplied deliverable instruction. Do not add
        OFFICIAL_TEMPLATE general findings: this group's canonical assessments account for those instructions.
        When includeOverview=false, return documentOverview=null and generalFindings=[]. Never report a partial
        response as complete. Do not claim academic approval, a grade or guaranteed full compliance.
        """;

    private AiReviewInstructionProtocol() { }

    public static Map<String, Object> schema() {
        var assessment = objectSchema(Map.of("id", string(100), "assessment", Map.of("type", "string", "enum",
                List.of("APPEARS_ADDRESSED", "NEEDS_ATTENTION", "CHECK_MANUALLY", "NOT_APPLICABLE")),
            "explanation", string(700), "documentEvidence", string(1600), "page", pageSchema(), "section", string(200)));
        var overview = objectSchema(Map.of("text", string(1200), "actualDocumentType", string(200),
            "evidence", string(1600), "wrongDocument", Map.of("type", "boolean")));
        var finding = objectSchema(Map.of("issue", string(600), "source", Map.of("type", "string", "enum",
                List.of("DOCUMENT", "DELIVERABLE_REQUIREMENTS")), "evidence", string(1600),
            "requirement", string(4000), "page", pageSchema(), "section", string(200)));
        return objectSchema(Map.of("complete", Map.of("type", "boolean"),
            "instructionAssessments", Map.of("type", "array", "items", assessment, "maxItems", MAX_GROUP_ITEMS),
            "documentOverview", Map.of("anyOf", List.of(overview, Map.of("type", "null"))),
            "generalFindings", Map.of("type", "array", "items", finding, "maxItems", 8)));
    }

    public static Result parse(JsonNode report, TemplateInstructionPreparation.Prepared template,
            List<TemplateInstructionPreparation.Instruction> group, boolean includeOverview) {
        if (template == null || group == null || (group.isEmpty() && !includeOverview) || group.size() > MAX_GROUP_ITEMS)
            throw invalid("Invalid instruction assessment group.");
        object(report, TOP);
        if (report.toString().length() > 150_000 || !report.path("complete").isBoolean()
                || !report.path("complete").booleanValue()) throw invalid("The instruction group was not completely assessed.");
        var expected = new LinkedHashMap<String, TemplateInstructionPreparation.Instruction>();
        for (var instruction : group) {
            if (instruction == null || instruction.id() == null || instruction.id().isBlank()
                    || instruction.source() == null || !template.instructions().contains(instruction)
                    || expected.putIfAbsent(instruction.id(), instruction) != null)
                throw invalid("Invalid fixed instruction identity.");
        }
        JsonNode assessments = report.path("instructionAssessments");
        if (!assessments.isArray() || assessments.size() != expected.size())
            throw invalid("The response does not account for every instruction.");
        var received = new LinkedHashMap<String, JsonNode>();
        for (JsonNode assessment : assessments) {
            object(assessment, ASSESSMENT);
            String id = text(assessment, "id", 1, 100);
            if (!expected.containsKey(id) || received.putIfAbsent(id, assessment) != null)
                throw invalid("Unknown or duplicate instruction identity.");
        }
        var findings = generalFindings(report.path("generalFindings"), includeOverview);
        var checks = new ArrayList<VerifiedCheck>();
        var notes = new ArrayList<Finding>();
        var rows = new ArrayList<CriterionAssessment>();
        for (var instruction : group) {
            var value = received.get(instruction.id());
            CriterionAssessmentLabel label;
            try { label = CriterionAssessmentLabel.valueOf(text(value, "assessment", 1, 30)); }
            catch (IllegalArgumentException failure) { throw invalid("Unknown instruction assessment."); }
            String explanation = text(value, "explanation", 1, 700);
            String evidence = text(value, "documentEvidence", 0, 1600);
            var location = location(value);
            var source = instruction.source();
            String authority = source.instruction();
            var checkIndexes = new ArrayList<Integer>();
            var findingIndexes = new ArrayList<Integer>();
            var noteIndexes = new ArrayList<Integer>();
            CoverageStatus status;
            switch (label) {
                case APPEARS_ADDRESSED -> {
                    if (evidence.isBlank() || location == null) throw invalid("An addressed instruction needs PDF evidence and a page.");
                    checkIndexes.add(checks.size());
                    checks.add(new VerifiedCheck(source.title(), FindingSource.OFFICIAL_TEMPLATE, evidence, authority, location));
                    status = CoverageStatus.EVIDENCE_RECORDED;
                }
                case NEEDS_ATTENTION -> {
                    findingIndexes.add(findings.size());
                    findings.add(new Finding(explanation, FindingSource.OFFICIAL_TEMPLATE, evidence, authority,
                        source.title(), null, location));
                    status = CoverageStatus.ISSUE_RECORDED;
                }
                case CHECK_MANUALLY -> {
                    noteIndexes.add(notes.size());
                    notes.add(new Finding(explanation, FindingSource.OFFICIAL_TEMPLATE, evidence, authority,
                        source.title(), null, location));
                    status = CoverageStatus.NEEDS_VERIFICATION;
                }
                case NOT_APPLICABLE -> {
                    if (source.applicability() == Applicability.REQUIRED)
                        throw invalid("A required instruction cannot be marked not applicable.");
                    status = CoverageStatus.EVIDENCE_RECORDED;
                }
                default -> throw invalid("Unsupported instruction assessment.");
            }
            rows.add(new CriterionAssessment(instruction.id(), authority, FindingSource.OFFICIAL_TEMPLATE, status,
                checkIndexes, findingIndexes, List.of(), noteIndexes, label, explanation, evidence, location, source.title()));
        }
        DocumentOverview overview = overview(report.path("documentOverview"), includeOverview);
        if (overview != null && overview.wrongDocument() && findings.stream().noneMatch(f -> f.source() == FindingSource.DOCUMENT))
            throw invalid("A document mismatch needs a supported document finding.");
        ReviewOutcome outcome = !findings.isEmpty() ? ReviewOutcome.ISSUES_IDENTIFIED
            : !notes.isEmpty() ? ReviewOutcome.INCONCLUSIVE : ReviewOutcome.NO_ISSUES_IN_CHECKED_AREAS;
        return new Result("The supplied instruction group has been assessed.", List.copyOf(findings), List.of(),
            List.of(), "Review the cited evidence before making an academic decision.", List.copyOf(checks), List.copyOf(notes), outcome,
            new ReviewCoverage(rows, 0, 1, null, "Assessed against the saved official-template instructions."), overview);
    }

    private static ArrayList<Finding> generalFindings(JsonNode values, boolean includeOverview) {
        if (!values.isArray() || values.size() > 8 || (!includeOverview && !values.isEmpty()))
            throw invalid("Invalid general findings for this group.");
        var result = new ArrayList<Finding>();
        for (JsonNode value : values) {
            object(value, FINDING);
            FindingSource source;
            try { source = FindingSource.valueOf(text(value, "source", 1, 30)); }
            catch (IllegalArgumentException failure) { throw invalid("Unknown finding source."); }
            if (source == FindingSource.OFFICIAL_TEMPLATE) throw invalid("Template findings must use a canonical instruction.");
            String requirement = text(value, "requirement", 0, 4000);
            if (source == FindingSource.DOCUMENT ? !requirement.isEmpty() : requirement.isBlank())
                throw invalid("The finding authority does not match its source.");
            result.add(new Finding(text(value, "issue", 1, 600), source, text(value, "evidence", 1, 1600),
                requirement, null, null, location(value)));
        }
        return result;
    }

    private static DocumentOverview overview(JsonNode value, boolean required) {
        if (!required) {
            if (!value.isNull()) throw invalid("Only the first group supplies a document overview.");
            return null;
        }
        object(value, OVERVIEW);
        if (!value.path("wrongDocument").isBoolean()) throw invalid("Invalid document overview identity.");
        return new DocumentOverview(text(value, "text", 1, 1200), text(value, "actualDocumentType", 1, 200),
            value.path("wrongDocument").booleanValue(), text(value, "evidence", 1, 1600));
    }

    private static EvidenceLocation location(JsonNode value) {
        JsonNode page = value.path("page");
        if (!page.isIntegralNumber() || !page.canConvertToInt() || page.intValue() < 0 || page.intValue() > 1000)
            throw invalid("Invalid PDF page reference.");
        String section = text(value, "section", 0, 200);
        return page.intValue() == 0 ? null : new EvidenceLocation(page.intValue(), section);
    }

    private static String text(JsonNode node, String field, int minimum, int maximum) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual()) throw invalid("Missing response text: " + field);
        String text = value.textValue().strip();
        if (text.length() < minimum || text.length() > maximum) throw invalid("Invalid response text: " + field);
        return text;
    }
    private static void object(JsonNode node, Set<String> fields) {
        if (node == null || !node.isObject() || node.size() != fields.size()) throw invalid("Incomplete or unexpected response fields.");
        var seen = new HashSet<String>();
        node.fieldNames().forEachRemaining(seen::add);
        if (!seen.equals(fields)) throw invalid("Incomplete or unexpected response fields.");
    }
    private static Map<String, Object> objectSchema(Map<String, Object> properties) {
        return Map.of("type", "object", "additionalProperties", false, "properties", properties,
            "required", properties.keySet().stream().sorted().toList());
    }
    private static Map<String, Object> string(int maximum) { return Map.of("type", "string", "maxLength", maximum); }
    private static Map<String, Object> pageSchema() { return Map.of("type", "integer", "minimum", 0, "maximum", 1000); }
    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }
}
