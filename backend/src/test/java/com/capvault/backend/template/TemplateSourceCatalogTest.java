package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class TemplateSourceCatalogTest {
    @Test
    void keepsLiteralWhitespaceUnicodeAndDeterministicAbsoluteLineIds() {
        var pages = List.of("1. Scope\r\n  Specify the o\uFB03ce staffing\u00a0plan.\r\n");
        var first = TemplateSourceCatalog.build(pages);
        assertThat(first.blocks()).isEqualTo(TemplateSourceCatalog.build(pages).blocks());
        assertThat(first.require("p1l2").text()).isEqualTo("  Specify the o\uFB03ce staffing\u00a0plan.");
        assertThat(first.require("p1l2").headingPath()).containsExactly("p1l1");
        assertThatThrownBy(() -> first.blocks().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void joinsAnObviousCrossPageQualifierWithSeparateValidSourceSpans() {
        String first = "Reference document\nPrepared version\nPage 1 of 3\n"
            + "Background A\nBackground B\nBackground C\nBackground D\nBackground E\nBackground F\nBackground G\n"
            + "7.6. Problem resolution\n"
            + "Specify the resources, tools, reporting procedures and the complete responsibilities for problem reporting,\n";
        String second = "Reference document\nPrepared version\nPage 2 of 3\n"
            + "analysis and resolution so that rework is tracked and improvements can be measured.\n"
            + "7.7. Subcontractor management\nSpecify each subcontractor's selection criteria.\n"
            + "Field A\nField B\nField C\nField D\nField E\nField F";
        String third = "Reference document\nPrepared version\nPage 3 of 3\n8. Closing notes\n"
            + "Record final questions.\nField G\nField H\nField I\nField J\nField K\nField L\nField M";
        var catalog = TemplateSourceCatalog.build(List.of(first, second, third));
        var block = catalog.require("p1l12");
        assertThat(block.text()).isEqualTo(
            "Specify the resources, tools, reporting procedures and the complete responsibilities for problem reporting,\n"
            + "analysis and resolution so that rework is tracked and improvements can be measured.");
        assertThat(block.spans()).containsExactly(new TemplateSourceCatalog.Span(1, 12, 12),
            new TemplateSourceCatalog.Span(2, 4, 4));
        assertThat(block.page()).isEqualTo(1);
        assertThat(catalog.promptBlocks(2, 2)).anySatisfy(x -> {
            assertThat(x.get("id")).isEqualTo("p1l12");
            assertThat(x.get("inRequestedRange")).isEqualTo(false);
        });
        assertThat(catalog.blocks()).noneMatch(x -> x.text().contains("Reference document"));
    }

    @Test
    void preservesParagraphQualifiersAndSeparateTableLabelsAndCaptions() {
        var catalog = TemplateSourceCatalog.build(List.of("4.3. Roles and responsibilities\n"
            + "Identify the organizational units responsible for each major work activity and supporting process and\n"
            + "identify who carries out each responsibility. A matrix may be used.\n"
            + "TEAM MEMBER\nROLE & RESPONSIBILITIES\nSEM 1 SEM 2\n"
            + "[Table 4.3.1] Roles and Responsibilities"));
        assertThat(catalog.require("p1l2").text()).endsWith("A matrix may be used.");
        assertThat(catalog.require("p1l4").text()).isEqualTo("TEAM MEMBER");
        assertThat(catalog.require("p1l5").text()).isEqualTo("ROLE & RESPONSIBILITIES");
        assertThat(catalog.require("p1l7").kindHint()).isEqualTo("CAPTION");
    }

    @Test
    void keepsExampleScopeAcrossPagesUntilTheNextNumberedBodySection() {
        var catalog = TemplateSourceCatalog.build(List.of("5.1. Staffing\nSpecify staffing needs.\n"
                + "Example 1: Museum project\nName Affiliation\nPerson A\n[Table 5.1] Sample team",
            "Person B\n[Table 5.2] Sample continuation\n5.2. Work plan\nSpecify the actual work activities."));
        assertThat(catalog.require("p1l3").kindHint()).isEqualTo("EXAMPLE_MARKER");
        assertThat(catalog.require("p1l4").exampleHint()).isTrue();
        assertThat(catalog.require("p2l1").exampleHint()).isTrue();
        assertThat(catalog.require("p2l2").exampleHint()).isTrue();
        assertThat(catalog.require("p2l3").exampleHint()).isFalse();
        assertThat(catalog.require("p2l4").headingPath()).containsExactly("p2l3");
        assertThat(catalog.promptBlocks(2, 2)).anySatisfy(x ->
            assertThat(x.get("id")).isEqualTo("p1l3"));
    }

    @Test
    void keepsMoreThan110StandaloneDirectionsWithoutMergingOrClipping() {
        List<String> directions = new ArrayList<>();
        for (int i = 0; i < 113; i++) {
            directions.add("Specify independently assessed content item " + i
                + " with its own evidence and the complete applicable qualification.");
        }
        var catalog = TemplateSourceCatalog.build(List.of(String.join("\n", directions)));
        assertThat(catalog.blocks()).hasSize(113);
        assertThat(catalog.require("p1l113").text()).isEqualTo(directions.getLast());
    }

    @Test
    void retainsRepeatedSentenceInstructionsAndBareCompletedExampleMarkers() {
        var catalog = TemplateSourceCatalog.build(List.of(
            "Shared header\nSpecify the responsible person.\nCompleted example\nExample Person",
            "Shared header\nSpecify the responsible person.\n2. Actual plan\nState the actual owner."));
        assertThat(catalog.require("p1l2").text()).isEqualTo("Specify the responsible person.");
        assertThat(catalog.require("p2l2").text()).isEqualTo("Specify the responsible person.");
        assertThat(catalog.require("p1l3").kindHint()).isEqualTo("EXAMPLE_MARKER");
        assertThat(catalog.require("p1l4").exampleHint()).isTrue();
        assertThat(catalog.require("p2l3").exampleHint()).isFalse();
    }

    @Test
    void retainsRepeatedResponseFieldsOnShortPages() {
        var catalog = TemplateSourceCatalog.build(List.of("File reference\nResponsible operator\n"
                + "Describe this activity.",
            "File reference\nResponsible operator\nDescribe the other activity."));
        assertThat(catalog.require("p1l1").text()).isEqualTo("File reference");
        assertThat(catalog.require("p2l1").text()).isEqualTo("File reference");
        assertThat(catalog.require("p2l2").text()).isEqualTo("Responsible operator");
    }

    @Test
    void joinsAShortCrossPageDirectionEndingWithAnUnfinishedConjunction() {
        var catalog = TemplateSourceCatalog.build(List.of(
            "1. Purpose\nDescribe the purpose of this document and",
            "identify who should use it."));
        assertThat(catalog.require("p1l2").text()).isEqualTo(
            "Describe the purpose of this document and\nidentify who should use it.");
        assertThat(catalog.require("p1l2").spans()).containsExactly(
            new TemplateSourceCatalog.Span(1, 2, 2), new TemplateSourceCatalog.Span(2, 1, 1));
    }

    @Test
    void runningHeadersOnSparsePagesCannotReplaceCrossPageInstructionClauses() {
        var catalog = TemplateSourceCatalog.build(List.of(
            "Prepared operating protocol\nWorking template\n1\n1. Purpose\nExplain the purpose of this document.",
            "Prepared operating protocol\nWorking template\n2\n2. Investigation and recovery\n"
                + "When a method changes after a failure, retain the previous method, the reason for the\nchange and",
            "Prepared operating protocol\nWorking template\n3\n"
                + "the date from which the new method applies; explain how observations made by the two methods will\n"
                + "be distinguished in later analysis.\n3. Closeout\nRecord the evidence needed to close the period."));
        var instruction = catalog.require("p2l5");
        assertThat(instruction.text()).isEqualTo(
            "When a method changes after a failure, retain the previous method, the reason for the\nchange and\n"
                + "the date from which the new method applies; explain how observations made by the two methods will\n"
                + "be distinguished in later analysis.");
        assertThat(instruction.spans()).containsExactly(
            new TemplateSourceCatalog.Span(2, 5, 6), new TemplateSourceCatalog.Span(3, 4, 5));
        assertThat(catalog.require("p1l1").text()).isEqualTo("Prepared operating protocol");
        assertThat(catalog.blocks()).noneMatch(x -> x.page() > 1 && x.text().contains("Prepared operating protocol"));
    }

    @Test
    void joinsPdfBoxStyleContinuationAfterAnInlineRunningPageLabel() {
        var catalog = TemplateSourceCatalog.build(List.of(
            "Prepared operating protocol\nWorking template 1\n1. Purpose\nExplain the purpose of this document.",
            "Prepared operating protocol\nWorking template 2\n2. Investigation and recovery\n"
                + "When a method changes after a failure, retain the previous method, the reason for the\nchange and",
            "Prepared operating protocol\nWorking template 3\n"
                + "the date from which the new method applies; explain how observations made by the two methods will\n"
                + "be distinguished in later analysis.\n3. Closeout\nRecord the evidence needed to close the period."));

        var instruction = catalog.require("p2l4");
        assertThat(instruction.text()).isEqualTo(
            "When a method changes after a failure, retain the previous method, the reason for the\nchange and\n"
                + "the date from which the new method applies; explain how observations made by the two methods will\n"
                + "be distinguished in later analysis.");
        assertThat(instruction.spans()).containsExactly(
            new TemplateSourceCatalog.Span(2, 4, 5), new TemplateSourceCatalog.Span(3, 3, 4));
        assertThat(catalog.require("p1l1").text()).isEqualTo("Prepared operating protocol");
        assertThat(catalog.require("p1l2").text()).isEqualTo("Working template 1");
        assertThat(catalog.blocks()).noneMatch(x -> x.page() > 1
            && (x.text().contains("Prepared operating protocol") || x.text().contains("Working template")));
    }

    @Test
    void onlyNormalizesInlineNumbersThatMatchTheActualRunningPageSequence() {
        var catalog = TemplateSourceCatalog.build(List.of(
            "File reference 41\n1. Purpose\nDescribe the intended work.",
            "File reference 42\n2. Activities\nDescribe the actual activities.",
            "File reference 43\n3. Closeout\nDescribe the remaining actions."));

        assertThat(catalog.require("p1l1").text()).isEqualTo("File reference 41");
        assertThat(catalog.require("p2l1").text()).isEqualTo("File reference 42");
        assertThat(catalog.require("p3l1").text()).isEqualTo("File reference 43");
    }

    @Test
    void uncertainRepeatedMarginsNeverBecomePartOfAContinuedBodyParagraph() {
        String header = "running template";
        var catalog = TemplateSourceCatalog.build(List.of(
            header + "\n1. Procedures\nRetain the previous procedure and",
            header + "\n2. Followup\nidentify the date from which the new procedure applies."));
        assertThat(catalog.require("p1l3").text()).isEqualTo("Retain the previous procedure and");
        assertThat(catalog.require("p2l1").text()).isEqualTo(header);
    }

    @Test
    void documentWideSiblingOpeningContextRemainsAvailableAfterTheSixteenthPage() {
        List<String> pages = new ArrayList<>();
        pages.add("1. Purpose\nExplain the intended decisions.");
        pages.add("2. Structure\nSections 3 through 17 apply to each actual operating unit.\n"
            + "Identify who resolves a decision affecting more than one unit.\n2.1. Repeated form\nUnit name");
        for (int i = 3; i <= 16; i++) pages.add(i + ". Procedure\nDescribe this procedure.");
        pages.add("17. Closeout\nState the evidence needed to close the period.");
        var context = TemplateSourceCatalog.build(pages).promptBlocks(17, 17);
        assertThat(context).anySatisfy(x -> {
            assertThat(x.get("id")).isEqualTo("p2l2");
            assertThat(x.get("inRequestedRange")).isEqualTo(false);
        });
        assertThat(context).anySatisfy(x -> {
            assertThat(x.get("id")).isEqualTo("p2l3");
            assertThat(x.get("inRequestedRange")).isEqualTo(false);
        });
        assertThat(context).anySatisfy(x -> {
            assertThat(x.get("id")).isEqualTo("p17l2");
            assertThat(x.get("inRequestedRange")).isEqualTo(true);
        });
    }

    @Test
    void retainsNestedHeadingsAndOnlyRelevantPriorPageContext() {
        var catalog = TemplateSourceCatalog.build(List.of("1. Introduction\nDescribe the document.\n"
                + "2. Transactions\nFor each actual transaction, identify inputs and outputs.\n"
                + "2.1. Transaction identity\nName the transaction.",
            "2.2. Hardware interfaces\nState the supported devices.\n"
                + "3. Closing notes\nRecord any remaining questions."));
        assertThat(catalog.require("p2l1").headingPath()).containsExactly("p1l3");
        var included = catalog.promptBlocks(2, 2).stream().map(x -> x.get("id")).toList();
        assertThat(included).contains("p1l3", "p1l4", "p1l6", "p2l1", "p2l4");
        // Earlier root-section openings remain available as possible document-wide policy.
        assertThat(included).contains("p1l1", "p1l2");
    }

    @Test
    void sourceTextUsesDocumentOrderAndRejectsUnknownOrRepeatedIds() {
        var catalog = TemplateSourceCatalog.build(List.of("First field\nSecond field"));
        assertThat(catalog.text(List.of("p1l2", "p1l1"))).isEqualTo("First field\n\nSecond field");
        assertThatThrownBy(() -> catalog.require("p8l2")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.text(List.of("p1l1", "p1l1")))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.text(List.of("invented"))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsInvalidRangesPagesAndSpans() {
        var catalog = TemplateSourceCatalog.build(List.of("Body"));
        assertThatThrownBy(() -> catalog.promptBlocks(0, 1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.promptBlocks(1, 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.promptBlocks(1, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TemplateSourceCatalog.build(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TemplateSourceCatalog.Span(1, 8, 2))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
