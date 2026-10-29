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

    @Test void preservesExplicitDirectionSeparatelyFromExactEvidenceAndDerivedLocation() {
        var pages = List.of("Cover", "Contents", "2.1 Intended users\n" + QUOTE);
        String wording = "Name the project's users and explain each user's responsibilities.";
        var result = parse(pages, 3, 3, item(wording, id(pages, QUOTE)));
        assertThat(result).containsExactly(new TemplateInstructionProtocol.Draft(
            "Review content", QUOTE, QUOTE, "2.1 Intended users", 3,
            TemplateInstructionProtocol.Applicability.REQUIRED, ""));
        assertThatThrownBy(result::clear).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test void requiresReadableInstructionInsteadOfFallingBackToRawText() {
        var pages = List.of(QUOTE);
        var item = item("Name the users and their responsibilities.", id(pages, QUOTE));
        item.remove("instruction");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("incomplete");
        item.put("instruction", "  ");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("instruction");
        item.put("instruction", 42);
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("instruction");
    }

    @Test void modelCannotReplaceEvidencePageSectionOrConditionText() {
        var pages = List.of(QUOTE);
        for (String field : List.of("sourceQuote", "condition", "section", "page", "firstLine")) {
            var item = item("Name the users and their responsibilities.", id(pages, QUOTE));
            item.put(field, "An invented replacement.");
            assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("unexpected fields");
        }
    }

    @Test void preservesExactUnicodeAndCrossPageSourceIncludingAllClauses() {
        var pages = List.of("2. Staffing\nSpecify the o\uFB03ce staffing\u00a0plan, including its duration;",
            "identify who approves changes and who reports progress.");
        var item = item("Specify the office staffing plan and its duration. Identify who approves changes and reports progress.",
            containingIds(pages, "Specify", "identify"));
        var result = parse(pages, 1, 2, item).getFirst();
        assertThat(result.sourceQuote()).isEqualTo(
            "Specify the o\uFB03ce staffing\u00a0plan, including its duration;\n[…]\nidentify who approves changes and who reports progress.");
        assertThat(result.page()).isEqualTo(1);
        assertThat(result.instruction()).contains("staffing plan", "duration", "approves changes", "reports progress");
    }

    @Test void headingAndBulletSlotCanHaveAReadableDraftWithoutRewritingTheSource() {
        var pages = List.of("3. Detailed Design\nFor each transaction, provide the following.\n\n\uF0B7 Data Design\n o ERD or schema.");
        String raw = "\uF0B7 Data Design\n o ERD or schema.";
        var ids = containingIds(pages, "Data Design", "ERD or schema");
        var item = item("For each transaction, provide the data design, including an ERD or schema.", ids)
            .put("kind", "CONTENT_SLOT");
        item.putArray("contextIds").add(id(pages, "For each transaction, provide the following."));
        var result = parse(pages, 1, 1, item).getFirst();
        assertThat(result.instruction()).isEqualTo("For each transaction, provide the data design, including an ERD or schema.");
        assertThat(result.sourceQuote()).contains("\uF0B7", "ERD or schema", "For each transaction");
        assertThat(result.instruction()).doesNotContain("\uF0B7", "Provide content for:", "3. Detailed Design");
    }

    @Test void retainsConditionsAndPerEntityScopeWithReadableListsAndMeaningfulSymbols() {
        String scope = "For every actual segment, record the following.";
        String condition = "If recorded material is used, identify its file and playback method.";
        var pages = List.of("3. Segments\n" + scope + "\n\n" + condition + "\n\nFile reference");
        String wording = "For each segment, if recorded material is used:\n- Identify its file.\n- Explain its playback method.";
        var item = item(wording, id(pages, "File reference")).put("kind", "CONTENT_SLOT").put("applicability", "CONDITIONAL");
        item.putArray("contextIds").add(id(pages, scope)).add(id(pages, condition));
        item.putArray("conditionIds").add(id(pages, condition));
        var result = parse(pages, 1, 1, item).getFirst();
        assertThat(result.instruction()).startsWith(scope).contains("File reference");
        assertThat(result.condition()).isEqualTo(condition);
        assertThat(result.sourceQuote()).contains(scope, condition, "File reference");
        String symbols = "Keep ©, ®, ™, x ✕ y, a ➕ b, and x ≤ 5 at 90%.";
        var symbolPages = List.of(symbols);
        assertThat(parse(symbolPages, 1, 1, item(symbols, id(symbolPages, symbols))).getFirst().instruction()).isEqualTo(symbols);
    }

    @Test void rejectsUnusableFontGlyphsAndControlsInDraftButNotInEvidence() {
        var pages = List.of(QUOTE);
        for (String wording : List.of("\uF0B7 Name users.", "Name\u0000 users.", "✅")) {
            assertThatThrownBy(() -> parse(pages, 1, 1, item(wording, id(pages, QUOTE))))
                .isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(parse(pages, 1, 1, item("✅ Name users.\n\nExplain their roles.", id(pages, QUOTE)))
            .getFirst().instruction()).isEqualTo(QUOTE);
    }

    @Test void doesNotDefaultOrLoseApplicabilityAndRequiresRetainedConditions() {
        var pages = List.of(QUOTE + "\n\nIf a service is used, describe its interface.");
        var item = item("Name users and their responsibilities.", id(pages, QUOTE)).put("applicability", "OPTIONAL");
        assertThat(parse(pages, 1, 1, item).getFirst().applicability()).isEqualTo(TemplateInstructionProtocol.Applicability.OPTIONAL);
        item.put("applicability", "CONDITIONAL");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("condition");
        item.putArray("conditionIds").add(id(pages, "If a service is used, describe its interface."));
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("retained source context");
        item.putArray("contextIds").add(id(pages, "If a service is used, describe its interface."));
        assertThat(parse(pages, 1, 1, item).getFirst().condition()).isEqualTo("If a service is used, describe its interface.");
        item.put("applicability", "REQUIRED");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("condition");
        item.put("applicability", "SUGGESTED");
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("unknown applicability");
    }

    @Test void strictParsingRejectsWorkedExamplesIncludingWhenUsedAsContext() {
        var pages = List.of("1. Staffing\nExample 1: Completed staffing plan\n\n"
            + "The purchase is required on March 22, 2005.\n\n2. Controls\n" + QUOTE);
        String example = id(pages, "The purchase is required on March 22, 2005.");
        var item = item("Buy the sample equipment.", example);
        assertThatThrownBy(() -> parse(pages, 1, 1, item)).hasMessageContaining("example");
        // Draft mode retains uncertainty for human approval, rather than declaring its semantics verified.
        assertThat(TemplateInstructionProtocol.parseDraft(group(1, 1, item), pages, 1, 1)).hasSize(1);
        var contextual = item("Name users.", id(pages, QUOTE));
        contextual.putArray("contextIds").add(example);
        assertThatThrownBy(() -> parse(pages, 1, 1, contextual)).hasMessageContaining("example");
    }

    @Test void rejectsDuplicateSelectionsRegardlessOfRewordingOrApplicability() {
        var pages = List.of(QUOTE);
        var first = item("Name users and describe their responsibilities.", id(pages, QUOTE));
        var duplicate = first.deepCopy().put("instruction", "Identify users and their roles.").put("applicability", "OPTIONAL");
        assertThatThrownBy(() -> parse(pages, 1, 1, first, duplicate)).hasMessageContaining("repeats");
    }

    @Test void identicalLabelsInDifferentSectionsRemainDistinct() {
        var pages = List.of("3.1 Security\nDetails\n3.2 Reliability\nDetails");
        var security = item("Provide security details.", "p1l2").put("kind", "CONTENT_SLOT");
        security.putArray("contextIds").add("p1l1");
        var reliability = item("Provide reliability details.", "p1l4").put("kind", "CONTENT_SLOT");
        reliability.putArray("contextIds").add("p1l3");
        assertThat(parse(pages, 1, 1, security, reliability)).extracting(TemplateInstructionProtocol.Draft::instruction)
            .containsExactly("Provide security details.", "Provide reliability details.");
    }

    @Test void rejectsUnknownRepeatedAndOutOfRangeIdsAndMalformedResponses() {
        var pages = List.of("Cover", QUOTE);
        assertThatThrownBy(() -> parse(pages, 1, 1, item("Name users.", "p99l1"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> parse(pages, 1, 1, item("Name users.", id(pages, QUOTE)))).hasMessageContaining("outside");
        var repeated = item("Name users.", id(pages, QUOTE), id(pages, QUOTE));
        assertThatThrownBy(() -> parse(pages, 1, 2, repeated)).hasMessageContaining("repeated source block ID");
        var wrong = item("Name users.", id(pages, QUOTE)).put("kind", "PARAPHRASE");
        assertThatThrownBy(() -> parse(pages, 1, 2, wrong)).hasMessageContaining("source kind");
        wrong.put("kind", "INSTRUCTION").put("sourceIds", "p2l1");
        assertThatThrownBy(() -> parse(pages, 1, 2, wrong)).hasMessageContaining("sourceIds");
    }

    @Test void supportsMoreThan99InstructionsWithoutTruncationAndChecksGroupBounds() {
        var lines = new ArrayList<String>();
        for (int i = 1; i <= 110; i++) lines.add("Describe responsibility for distinct activity number " + i + ".");
        var pages = List.of(String.join("\n\n", lines));
        var items = new ArrayList<ObjectNode>();
        for (String line : lines) items.add(item(line, id(pages, line)));
        assertThat(parse(pages, 1, 1, items.toArray(ObjectNode[]::new))).hasSize(110);
        assertThatThrownBy(() -> parse(pages, 1, 1, java.util.Collections.nCopies(129, items.getFirst()).toArray(ObjectNode[]::new)))
            .hasMessageContaining("too many instructions");
        var group = group(1, 1).put("complete", false);
        assertThatThrownBy(() -> TemplateInstructionProtocol.parse(group, pages, 1, 1)).hasMessageContaining("not completely");
        group.put("complete", true).put("lastPage", 2);
        assertThatThrownBy(() -> TemplateInstructionProtocol.parse(group, pages, 1, 1)).hasMessageContaining("does not match");
        assertThatThrownBy(() -> TemplateInstructionProtocol.sourceBlocks(pages, 0, 1)).hasMessageContaining("page range");
    }

    @Test void schemaSeparatesModelWordingFromBackendOwnedEvidence() {
        var schema = json.valueToTree(TemplateInstructionProtocol.schema());
        var item = schema.path("properties").path("instructions").path("items");
        assertThat(item.path("required").toString()).contains("instruction", "sourceIds", "contextIds", "conditionIds")
            .doesNotContain("sourceQuote", "firstLine", "page");
        assertThat(item.path("additionalProperties").booleanValue()).isFalse();
        assertThat(TemplateInstructionProtocol.VERSION).isEqualTo("template-instructions-pdf-v10-faithful-readable-draft");
        var order = new ArrayList<String>();
        item.path("properties").fieldNames().forEachRemaining(order::add);
        assertThat(order).containsExactly("sourceIds", "contextIds", "conditionIds", "kind", "applicability", "title", "instruction");
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
    private ObjectNode item(String instruction, String... sourceIds) {
        var item = json.createObjectNode().put("title", "Review content").put("kind", "INSTRUCTION")
            .put("applicability", "REQUIRED").put("instruction", instruction);
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
