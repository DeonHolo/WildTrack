package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class TemplateInstructionProtocolTest {
    private final ObjectMapper json = new ObjectMapper();
    private static final String QUOTE = "Explain the project's named users and their responsibilities.";

    @Test
    void copiesTheOriginalWordingAndDerivesTheSectionAndAbsolutePage() {
        var pages = List.of("Cover", "Contents", "2.1 Intended users\n" + QUOTE);
        var item = item("Describe users and responsibilities", "INSTRUCTION", id(pages, QUOTE));
        var result = parse(pages, 3, 3, item);

        assertThat(result).containsExactly(new TemplateInstructionProtocol.Draft(
            "Describe users and responsibilities", QUOTE, QUOTE, "2.1 Intended users", 3,
            TemplateInstructionProtocol.Applicability.REQUIRED, ""));
        assertThatThrownBy(() -> result.clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void cannotAcceptAnyModelWrittenInstructionOrSourceQuotation() {
        var pages = List.of(QUOTE);
        for (String field : List.of("instruction", "sourceQuote", "condition", "section", "page", "firstLine")) {
            var item = item("Describe users", "INSTRUCTION", id(pages, QUOTE));
            item.put(field, "An invented replacement.");
            assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("unexpected fields");
        }
    }

    @Test
    void preservesExactUnicodeAndEveryClauseInTheSelectedSource() {
        String source = "  Specify the o\uFB03ce staffing\u00a0plan, including its duration;\n"
            + "identify who approves changes and who reports progress.";
        var pages = List.of("2. Staffing\n" + source);
        var ids = containingIds(pages, "Specify", "identify");
        var result = parse(pages, 1, 1, item("Describe staffing", "INSTRUCTION", ids));
        String joinedSourceUnits = source.replace(";\n", ";\n\n");
        assertThat(result.getFirst().instruction()).isEqualTo(TemplateInstructionProtocol.readable(joinedSourceUnits));
        assertThat(result.getFirst().sourceQuote()).isEqualTo(joinedSourceUnits);
    }

    @Test
    void combinesCrossPageContinuationWithoutModelGeneratedLineRangesOrWording() {
        var pages = List.of(
            "1. Purpose\nDescribe the purpose of this document and",
            "identify its audience and the decisions it supports.\n\n1.2 Scope");
        var ids = containingIds(pages, "Describe", "identify");
        var result = parse(pages, 1, 1, item("Explain document purpose", "INSTRUCTION", ids));
        assertThat(result.getFirst().instruction()).isEqualTo(
            "Describe the purpose of this document and identify its audience and the decisions it supports.");
    }

    @Test
    void addsOnlyAFixedPrefixForAnOtherwiseUnexplainedBlankContentSlot() {
        var pages = List.of("1. Introduction\n1.2 Scope");
        var result = parse(pages, 1, 1, item("Describe scope", "CONTENT_SLOT", id(pages, "1.2 Scope")));
        assertThat(result.getFirst().instruction()).isEqualTo("Provide content for 1.2 Scope.");
        assertThat(result.getFirst().sourceQuote()).isEqualTo("1.2 Scope");
    }

    @Test void formatsHeadingsAndRemovesOnlyDecorativeEmojiWithoutRewritingSourceEvidence() {
        var pages = List.of("1. Introduction\n1.3 Definitions and Acronyms");
        var item = item("Definitions and acronyms", "CONTENT_SLOT", id(pages, "1.3 Definitions and Acronyms"));
        item.putArray("contextIds").add(id(pages, "1. Introduction"));
        var draft = parse(pages, 1, 1, item).getFirst();
        assertThat(draft.instruction()).isEqualTo("Provide content for 1.3 Definitions and Acronyms, under 1. Introduction.");
        assertThat(draft.sourceQuote()).isEqualTo("1. Introduction\n\n1.3 Definitions and Acronyms");
        assertThat(TemplateInstructionProtocol.readable("\u2705 List all roles.\n\nIf applicable, include x \u2264 5 and 90%."))
            .isEqualTo("List all roles. If applicable, include x \u2264 5 and 90%.");
        assertThat(TemplateInstructionProtocol.readable("Keep ©, ®, ™, x ✕ y, a ➕ b, and x ≤ 5."))
            .isEqualTo("Keep ©, ®, ™, x ✕ y, a ➕ b, and x ≤ 5.");
    }

    @Test
    void retainsASampleFilledBodyHeadingWithoutRequiringTheSampleFacts() {
        var pages = List.of("1. Purpose\nThe Cedar service plans outdoor events.\n\n2. Scope");
        var result = parse(pages, 1, 1, item("Document purpose", "CONTENT_SLOT", id(pages, "1. Purpose")));
        assertThat(result.getFirst().instruction()).isEqualTo("Provide content for 1. Purpose.");
        assertThat(result.getFirst().instruction()).doesNotContain("Cedar", "outdoor");
    }

    @Test
    void rejectsContextThatWasNotActuallySuppliedForThisPageGroup() {
        var pages = List.of(QUOTE, "2. Scope\nDescribe the boundaries.", "3. Future scope");
        var item = item("Describe users", "INSTRUCTION", id(pages, QUOTE));
        item.putArray("contextIds").add(id(pages, "3. Future scope"));
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("supplied context");
    }

    @Test
    void rejectsWorkedExamplesAsGoverningContextOrConditions() {
        var pages = List.of("1. Staffing\nExample: completed staffing plan\n\n"
            + "If Cedar buys a server, buy the Cedar rack.\n\n2. Users\n" + QUOTE);
        String example = id(pages, "If Cedar buys a server, buy the Cedar rack.");
        var item = item("Describe users", "INSTRUCTION", id(pages, QUOTE));
        item.putArray("contextIds").add(example);
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("example");
        item.put("applicability", "CONDITIONAL").putArray("conditionIds").add(example);
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("example");
    }

    @Test
    void retainsParentScopeAndAnExactConditionInsideEachApplicableChild() {
        var pages = List.of(
            "3. Segment records\nFor every actual segment, record the following.\n\n"
            + "If recorded material is used, identify the file and playback method.\n\nFile reference");
        String scope = id(pages, "For every actual segment, record the following.");
        String condition = id(pages, "If recorded material is used, identify the file and playback method.");
        var item = item("Identify recorded material", "CONTENT_SLOT", id(pages, "File reference"));
        item.putArray("contextIds").add(condition).add(scope);
        item.put("applicability", "CONDITIONAL").putArray("conditionIds").add(condition);
        var result = parse(pages, 1, 1, item).getFirst();

        assertThat(result.instruction()).isEqualTo(
            "For every actual segment, record the following. "
            + "If recorded material is used, identify the file and playback method. Provide content for File reference.");
        assertThat(result.condition()).isEqualTo(
            "If recorded material is used, identify the file and playback method.");
        assertThat(result.sourceQuote()).contains("For every actual segment", "If recorded material", "File reference");
    }

    @Test
    void preservesOptionalAndConditionalApplicabilityWithoutDefaults() {
        var pages = List.of(QUOTE);
        var item = item("Describe users", "INSTRUCTION", id(pages, QUOTE)).put("applicability", "OPTIONAL");
        assertThat(parse(pages, 1, 1, item).getFirst().applicability())
            .isEqualTo(TemplateInstructionProtocol.Applicability.OPTIONAL);
        item.put("applicability", "CONDITIONAL");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("condition");
        item.putArray("conditionIds").add(id(pages, QUOTE));
        assertThat(parse(pages, 1, 1, item).getFirst().condition()).isEqualTo(QUOTE);
        item.put("applicability", "REQUIRED");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("condition");
        item.put("applicability", "SUGGESTED");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("unknown applicability");
    }

    @Test
    void rejectsAConditionThatWouldNotBeRetainedWithTheInstruction() {
        var pages = List.of(QUOTE + "\n\nIf an external service is used, describe its interface.");
        var item = item("Describe users", "INSTRUCTION", id(pages, QUOTE)).put("applicability", "CONDITIONAL");
        item.putArray("conditionIds").add(id(pages, "If an external service is used, describe its interface."));
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("retained source context");
    }

    @Test
    void rejectsCompletedExampleFactsEvenWithAnOtherwiseValidSourceId() {
        var pages = List.of("1. Staffing\nExample 1: Completed staffing plan\n\n"
            + "The purchase is required on March 22, 2005.\n\n2. Controls\n" + QUOTE);
        var example = item("Use the example date", "INSTRUCTION",
            id(pages, "The purchase is required on March 22, 2005."));
        assertThatThrownBy(() -> parse(pages, 1, 1, example)).hasMessageContaining("example");
        var draft = group(1, 1, example);
        var provisional = TemplateInstructionProtocol.parseDraft(draft, pages, 1, 1);
        assertThat(provisional.getFirst().instruction()).isEqualTo("The purchase is required on March 22, 2005.");
        example.put("instruction", "An invented rewrite.");
        assertThatThrownBy(() -> TemplateInstructionProtocol.parseDraft(draft, pages, 1, 1))
            .hasMessageContaining("unexpected fields");
    }

    @Test
    void retainsTheCompleteRequiredParagraphIncludingItsOptionalRepresentation() {
        String source = "Specify roles and their responsibilities. A matrix may be used to represent the relationships.";
        var pages = List.of(source);
        var result = parse(pages, 1, 1, item("Roles and responsibilities", "INSTRUCTION", id(pages, source)));
        assertThat(result.getFirst().instruction()).isEqualTo(source);
        assertThat(result.getFirst().applicability()).isEqualTo(TemplateInstructionProtocol.Applicability.REQUIRED);
    }

    @Test
    void preservesMoreThan99InstructionsWithoutTruncatingTheChecklist() {
        var lines = new ArrayList<String>();
        for (int i = 1; i <= 110; i++) lines.add("Describe responsibility for distinct activity number " + i + ".");
        var pages = List.of(String.join("\n\n", lines));
        var items = new ArrayList<ObjectNode>();
        for (int i = 1; i <= 110; i++)
            items.add(item("Describe activity " + i, "INSTRUCTION", id(pages, lines.get(i - 1))));
        var result = parse(pages, 1, 1, items.toArray(ObjectNode[]::new));
        assertThat(result).hasSize(110);
        assertThat(result.getLast().instruction()).isEqualTo(lines.getLast());
    }

    @Test
    void rejectsDuplicateSelectionsDespiteDifferentTitlesOrderOrApplicability() {
        var pages = List.of(QUOTE);
        var first = item("Describe users", "INSTRUCTION", id(pages, QUOTE));
        var duplicate = first.deepCopy().put("title", "A renamed duplicate").put("applicability", "OPTIONAL");
        assertThatThrownBy(() -> parse(pages, 1, 1, first, duplicate)).hasMessageContaining("repeats");
    }

    @Test
    void preservesIdenticalFieldLabelsUnderDifferentRequirements() {
        var pages = List.of("3.1 Security\nDetails\n3.2 Reliability\nDetails");
        var security = item("Security details", "CONTENT_SLOT", "p1l2");
        security.putArray("contextIds").add("p1l1");
        var reliability = item("Reliability details", "CONTENT_SLOT", "p1l4");
        reliability.putArray("contextIds").add("p1l3");
        var result = parse(pages, 1, 1, security, reliability);

        assertThat(result).hasSize(2);
        assertThat(result.getFirst().instruction()).isEqualTo("Provide content for Details, under 3.1 Security.");
        assertThat(result.getLast().instruction()).isEqualTo("Provide content for Details, under 3.2 Reliability.");
    }

    @Test
    void rejectsUnknownRepeatedAndOutOfRangeSourceIds() {
        var pages = List.of("Cover", QUOTE);
        var unknown = item("Describe users", "INSTRUCTION", "p99l1");
        assertThatThrownBy(() -> parse(pages, 1, 1, unknown)).isInstanceOf(IllegalArgumentException.class);
        var item = item("Describe users", "INSTRUCTION", id(pages, QUOTE));
        ObjectNode outside = item;
        assertThatThrownBy(() -> parse(pages, 1, 1, outside)).hasMessageContaining("outside");
        item.putArray("sourceIds").add(id(pages, QUOTE)).add(id(pages, QUOTE));
        ObjectNode repeated = item;
        assertThatThrownBy(() -> parse(pages, 1, 2, repeated)).hasMessageContaining("repeated source block ID");
    }

    @Test
    void rejectsUnexpectedMissingAndWronglyTypedFields() {
        var pages = List.of(QUOTE);
        var item = item("Describe users", "INSTRUCTION", id(pages, QUOTE));
        item.remove("kind");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("incomplete");
        item.put("kind", "PARAPHRASE");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("source kind");
        item.put("kind", "INSTRUCTION").put("sourceIds", "p1l1");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("sourceIds");
    }

    @Test
    void requiresCompletePageAccountingAndEnforcesGroupBoundsWithoutDroppingItems() {
        var pages = List.of(QUOTE);
        var group = group(1, 1);
        assertThat(TemplateInstructionProtocol.parse(group, pages, 1, 1)).isEmpty();
        group.put("complete", false);
        assertThatThrownBy(() -> TemplateInstructionProtocol.parse(group, pages, 1, 1)).hasMessageContaining("not completely");
        group.put("complete", true).put("lastPage", 2);
        assertThatThrownBy(() -> TemplateInstructionProtocol.parse(group, pages, 1, 1)).hasMessageContaining("does not match");
        var items = new ObjectNode[129];
        for (int i = 0; i < 129; i++) items[i] = item("Describe users", "INSTRUCTION", id(pages, QUOTE));
        assertThatThrownBy(() -> parse(pages, 1, 1, items)).hasMessageContaining("too many instructions");
        assertThatThrownBy(() -> TemplateInstructionProtocol.sourceBlocks(pages, 0, 1)).hasMessageContaining("page range");
    }

    @Test
    void schemaAllowsSelectionAndATitleButNoAuthoritativeGeneratedWording() {
        var schema = json.valueToTree(TemplateInstructionProtocol.schema());
        var item = schema.path("properties").path("instructions").path("items");
        assertThat(item.path("required").toString()).contains(
            "title", "kind", "sourceIds", "contextIds", "applicability", "conditionIds")
            .doesNotContain("instruction", "sourceQuote", "firstLine", "page");
        assertThat(item.path("additionalProperties").booleanValue()).isFalse();
        assertThat(TemplateInstructionProtocol.VERSION).isEqualTo("template-instructions-pdf-v8-readable-draft");
        var order = new ArrayList<String>();
        item.path("properties").fieldNames().forEachRemaining(order::add);
        assertThat(order).containsExactly("sourceIds", "contextIds", "conditionIds", "kind", "applicability", "title");
        order.clear();
        schema.path("properties").fieldNames().forEachRemaining(order::add);
        assertThat(order).containsExactly("firstPage", "lastPage", "instructions", "complete");
    }

    private String id(List<String> pages, String text) {
        return TemplateSourceCatalog.build(pages).blocks().stream()
            .filter(block -> block.text().equals(text)).findFirst().orElseThrow().id();
    }

    private String[] containingIds(List<String> pages, String... fragments) {
        return TemplateSourceCatalog.build(pages).blocks().stream()
            .filter(block -> java.util.Arrays.stream(fragments).anyMatch(block.text()::contains))
            .map(TemplateSourceCatalog.Block::id).toArray(String[]::new);
    }

    private ObjectNode item(String title, String kind, String... sourceIds) {
        var item = json.createObjectNode().put("title", title).put("kind", kind).put("applicability", "REQUIRED");
        var ids = item.putArray("sourceIds");
        for (String id : sourceIds) ids.add(id);
        item.putArray("contextIds");
        item.putArray("conditionIds");
        return item;
    }

    private List<TemplateInstructionProtocol.Draft> parse(List<String> pages, int first, int last, ObjectNode... items) {
        return TemplateInstructionProtocol.parse(group(first, last, items), pages, first, last);
    }

    private ObjectNode group(int first, int last, ObjectNode... items) {
        var group = json.createObjectNode().put("complete", true).put("firstPage", first).put("lastPage", last);
        var list = group.putArray("instructions");
        for (var item : items) list.add(item);
        return group;
    }
}
