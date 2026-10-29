package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;

class TemplateDraftTextTest {
    @Test void formattingCannotTurnOptionalMethodsIntoRequirementsOrDropExceptions() {
        String source = "Specify the control plan. Techniques that may be used include traceability and reviews.\n"
            + "A mechanism such as earned value tracking should be used, as appropriate.";
        String result = instruction("INSTRUCTION", "Use traceability, reviews and earned value tracking.", source);
        assertThat(result).isEqualToNormalizingWhitespace("Specify the control plan. Techniques that may be used include traceability and reviews. "
            + "A mechanism such as earned value tracking should be used, as appropriate.");
    }

    @Test void aMisclassifiedSlotStillPreservesItsExplicitDirections() {
        String source = "This subsection should list factors affecting requirements. These factors are not design constraints. "
            + "Changes to them can affect requirements.";
        assertThat(instruction("CONTENT_SLOT", "List the design constraints.", source)).isEqualTo(source);
    }

    @Test void completedExampleFactsCannotBecomeScopeRequirements() {
        var catalog = TemplateSourceCatalog.build(List.of("1. Scope\nSkySync is a weather app.\n\nWeather dashboard"));
        var sources = catalog.blocks();
        String result = TemplateDraftText.instruction("CONTENT_SLOT", "Provide a weather dashboard.", sources, List.of());
        assertThat(result).isEqualTo("Provide content for 1. Scope.");
        assertThat(result).doesNotContain("SkySync", "weather", "dashboard");
    }

    @Test void filledNamedUserExamplesDoNotImposeThoseUserClasses() {
        String result = instruction("CONTENT_SLOT", "Include general and registered users.",
            "2.2 User characteristics\n\uF0B7 General Users: View weather forecasts.\n\uF0B7 Registered Users: Track activities.");
        assertThat(result).isEqualTo("Provide content for 2.2 User characteristics.");
    }

    @Test void namedSchemaFieldsCanUseReadableModelWordingWithAnAlternativeIntact() {
        String source = "3. Detailed Design\n\uF0B7 Data Design\n o ERD or schema";
        String draft = "Provide the data design, including an ERD or schema.";
        assertThat(instruction("CONTENT_SLOT", draft, source)).isEqualTo(draft);
        String wrong = instruction("CONTENT_SLOT", "Provide the data design, including an ERD and schema.", source);
        assertThat(wrong).contains("ERD or schema").doesNotContain("\uF0B7", "ERD and schema");
    }

    @Test void numericLimitsAndSymbolsCannotBeReplacedOrRemovedFromAField() {
        String result = instruction("CONTENT_SLOT", "Provide a success rate of 90%.", "2. Results\nSuccess rate ≥ 85%");
        assertThat(result).contains("≥ 85%").doesNotContain("90%");
    }

    @Test void parentPerEntityDirectionIsRetainedWithoutAChainOfHeadings() {
        var parent = TemplateSourceCatalog.build(List.of("3. Segments\nFor every segment, record the following."));
        var child = TemplateSourceCatalog.build(List.of("3.1 File reference"));
        String result = TemplateDraftText.instruction("CONTENT_SLOT", "Provide the file reference.", child.blocks(), parent.blocks());
        assertThat(result).startsWith("For every segment, record the following.\n\n").doesNotContain("3. Segments\n");
    }

    @Test void unicodeBulletsAndWrappedLinesAreCleanedWithoutDroppingTechnicalSymbols() {
        assertThat(TemplateDraftText.layout("\uF0B7 Response time ≤ 2 s\n\uF0A7 Completion ≥ 85%\n\nSpecify the\nremaining limits."))
            .isEqualTo("- Response time ≤ 2 s\n- Completion ≥ 85%\nSpecify the remaining limits.");
    }

    @Test void selectedConditionsAndOtherGoverningContextDoNotDependOnAPhraseList() {
        for (String scope : List.of("If a sensor uses batteries, provide the following.",
                "When recorded material is included, identify its playback method.",
                "For all activities, record the following.")) {
            var parent = TemplateSourceCatalog.build(List.of("3. Context\n" + scope));
            var child = TemplateSourceCatalog.build(List.of("3.1 File reference"));
            assertThat(TemplateDraftText.instruction("CONTENT_SLOT", "Provide the file reference.",
                child.blocks(), parent.blocks())).startsWith(scope + "\n\n");
        }
    }

    @Test void anExplicitInstructionUsingWillKeepsItsCompleteDirection() {
        String direction = "The report will include the outcome for every completed task and exclude cancelled tasks.";
        assertThat(instruction("INSTRUCTION", "List task outcomes.", "2. Results\n" + direction)).isEqualTo(direction);
    }

    @Test void blankResponseRulesAreNotInstructionText() {
        assertThat(TemplateDraftText.layout("Record each value.\n____  ______\nKeep snake_case identifiers."))
            .isEqualTo("Record each value. Keep snake_case identifiers.");
    }

    @Test void aRepeatedSchemaEntityIsNotARequiredFixedEntityNumber() {
        var source = TemplateSourceCatalog.build(List.of("Module 1\n1.1 Transaction name\n\uF0B7 Use Case Diagram\n\uF0B7 Activity Diagram"));
        String draft = "For each module and transaction, provide a Use Case Diagram and Activity Diagram.";
        assertThat(TemplateDraftText.instruction("CONTENT_SLOT", draft, source.blocks(), List.of())).isEqualTo(draft);
    }

    private String instruction(String kind, String draft, String source) {
        return TemplateDraftText.instruction(kind, draft, TemplateSourceCatalog.build(List.of(source)).blocks(), List.of());
    }
}
