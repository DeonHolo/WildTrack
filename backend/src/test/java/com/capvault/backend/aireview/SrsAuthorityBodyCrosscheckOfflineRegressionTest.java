package com.capvault.backend.aireview;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import com.capvault.backend.filecheck.PdfInspector;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * Independent, offline requirements-to-PDF regressions using newly authored synthetic
 * QueueBoard inputs, never the owner PDFs or frozen SRS pilot fixtures/reports.
 *
 * Every fixture is rendered to a real in-memory PDF and extracted by production
 * PdfInspector before passing the text to the actual AI Review postprocessor.
 * No Gemini provider and no production Drive/UI path are invoked.
 */
class SrsAuthorityBodyCrosscheckOfflineRegressionTest {
    private static final String RESOURCES = "/aireview/srs-heading-regressions/";
    private static final String TITLE = "Software Requirements Specification (SRS)";
    private static final Pattern LEADING_NUMBER = Pattern.compile(
        "^(?:\\d+(?:\\.\\d+)*|[IVXLC]+)[.)]?\\s+", Pattern.CASE_INSENSITIVE);
    private static final AiReviewProvider.Result EMPTY_PROVIDER_RESULT =
        new AiReviewProvider.Result("Offline synthetic provider returned no findings.",
            List.of(), List.of(), List.of(), "No additional provider observations.");

    private String fixture(String file) throws Exception {
        try (InputStream in = getClass().getResourceAsStream(RESOURCES + file + ".txt")) {
            assertThat(in).as("test-only synthetic input " + file).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String pdfExtract(String authoredSource) throws Exception {
        return pdfExtractPages(authoredSource);
    }

    private static String pdfExtractPages(String... pageText) throws Exception {
        try (PDDocument pdf = new PDDocument()) {
            for (String authoredSource : pageText) {
                PDPage page = new PDPage(PDRectangle.A4);
                pdf.addPage(page);
                try (PDPageContentStream writer = new PDPageContentStream(pdf, page)) {
                    writer.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 9);
                    writer.setLeading(13);
                    writer.beginText();
                    writer.newLineAtOffset(42, 794);
                    for (String line : authoredSource.split("\\R", -1)) {
                        writer.showText(line);
                        writer.newLine();
                    }
                    writer.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            pdf.save(out);
            var parsed = new PdfInspector().inspect(out.toByteArray());
            assertThat(parsed.readable()).as("in-memory synthetic PDF must be readable").isTrue();
            assertThat(parsed.pageCount()).isEqualTo(pageText.length);
            assertThat(parsed.extractedText()).contains("Software Requirements Specification");
            return parsed.extractedText();
        }
    }

    private AiReviewProvider.Result review(String documentFixture, String templateFixture,
            String instructions) throws Exception {
        String document = pdfExtract(fixture(documentFixture));
        String template = templateFixture == null ? "" : pdfExtract(fixture(templateFixture));
        return AiReviewService.postprocessForBenchmark(
            EMPTY_PROVIDER_RESULT, TITLE, instructions, template, document);
    }

    private static String title(String heading) {
        return LEADING_NUMBER.matcher(heading).replaceFirst("")
            .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    private static void expectOnly(AiReviewProvider.Result result, String... advisoryHeadingTitles) {
        assertThat(result.missingRequiredSections())
            .as("a mapped template is not by itself an unconditional mandate for every section")
            .isEmpty();
        assertThat(result.findings().stream().filter(f ->
            f.issue().startsWith("Mapped-template body heading")).toList())
            .as("conservative mapped-template/body crosscheck must emit only unobserved, applicable headings")
            .extracting(AiReviewProvider.Finding::requirement)
            .map(SrsAuthorityBodyCrosscheckOfflineRegressionTest::title)
            .containsExactlyInAnyOrder(
                java.util.Arrays.stream(advisoryHeadingTitles).map(
                    SrsAuthorityBodyCrosscheckOfflineRegressionTest::title).toArray(String[]::new));
    }

    @Test
    void repeatedNumberedDottedTocEntriesDoNotCountAsBodyHeadings() throws Exception {
        String template = pdfExtract(fixture("numbered-authority"));
        String document = pdfExtract(fixture("numbered-toc-repeated-only"));
        assertThat(document).contains("2.1 Validation Rules");
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(document, "2.1 Validation Rules"))
            .as("repeated dotted TOC entries are not body sections").isFalse();

        var processed = AiReviewService.postprocessForBenchmark(
            EMPTY_PROVIDER_RESULT, TITLE, "", template, document);
        expectOnly(processed, "Validation Rules");
        assertThat(processed.findings()).allSatisfy(finding -> {
            assertThat(finding.source()).isEqualTo(AiReviewProvider.FindingSource.OFFICIAL_TEMPLATE);
            assertThat(template).contains(finding.requirement());
            assertThat(finding.issue()).contains("confirm applicability");
        });
    }

    @Test
    void leaderlessTocEntryAloneDoesNotProveMissingSectionIsActuallyPresent() throws Exception {
        var processed = review("leaderless-toc-only", "numbered-authority", "");
        expectOnly(processed, "Validation Rules");
    }

    @Test
    void duplicatedLeaderlessContentsEntriesRemainTocRatherThanTwoBodySections() throws Exception {
        var processed = review("leaderless-toc-repeated", "numbered-authority", "");
        expectOnly(processed, "Validation Rules");
    }

    @Test
    void alternativeNumberingAndActualBodyContentDoNotGenerateFalseMissingSections() throws Exception {
        var processed = review("body-numbered-variant", "numbered-authority", "");
        expectOnly(processed);
    }

    @Test
    void earlierPageContentsCannotOverrideActualHeadingOnLaterPdfPage() throws Exception {
        String template = pdfExtract(fixture("numbered-authority"));
        String contents = """
            Software Requirements Specification
            Table of Contents
            1. Overview .................................... 2
            2. Request Processing .......................... 2
            2.1 Validation Rules ........................... 2
            2.2 Recovery Rules ............................. 2
            """;
        String realBody = """
            Software Requirements Specification
            1. Overview
            Fictional QueueBoard processes local example requests only.
            2. Request Processing
            The example validates and schedules synthetic queue requests.
            2.1 Validation Rules
            Reject requests with empty display tokens before creating an example slot.
            2.2 Recovery Rules
            Report a synthetic API error without creating a duplicate request.
            """;
        String extracted = pdfExtractPages(contents, realBody);
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(extracted, "2.1 Validation Rules"))
            .as("real section title appears on page two, not solely in page-one TOC").isTrue();
        expectOnly(AiReviewService.postprocessForBenchmark(
            EMPTY_PROVIDER_RESULT, TITLE, "", template, extracted));

        String secondPageWithoutHeading = realBody.replace(
            "2.1 Validation Rules\nReject requests with empty display tokens before creating an example slot.\n", "");
        String extractedMissing = pdfExtractPages(contents, secondPageWithoutHeading);
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(extractedMissing, "2.1 Validation Rules"))
            .as("page-one TOC cannot substitute for absent page-two section").isFalse();
        expectOnly(AiReviewService.postprocessForBenchmark(
            EMPTY_PROVIDER_RESULT, TITLE, "", template, extractedMissing), "Validation Rules");
    }

    @Test
    void absentSubsectionWithPresentNumberedSiblingsReportsOnlyAbsentChild() throws Exception {
        String template = pdfExtract(fixture("sibling-authority"));
        String document = pdfExtract(fixture("sibling-subsection-absent"));
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(document, "3.1.1 Hardware interfaces")).isTrue();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(document, "3.1.2 Software interfaces")).isTrue();
        assertThat(AiReviewGroundingPolicy.containsBodyHeading(document, "3.1.3 Communications interfaces")).isFalse();

        var processed = AiReviewService.postprocessForBenchmark(
            EMPTY_PROVIDER_RESULT, TITLE, "", template, document);
        expectOnly(processed, "Communications interfaces");
    }

    @Test
    void explicitlyOptionalTemplateSubsectionIsNotUpgradedToMandatory() throws Exception {
        var processed = review("optional-omitted", "optional-authority",
            "The Illustrations subsection is optional; do not require it when no figures are supplied.");
        expectOnly(processed);
    }

    @Test
    void noMappedAuthorityNeverInventsMissingTemplateSection() throws Exception {
        var processed = review("sibling-subsection-absent", null, "");
        expectOnly(processed);
        assertThat(processed.limitations()).anyMatch(limit ->
            limit.startsWith("No official template was supplied"));
    }

    @Disabled("Explicit instruction-only automatic heading detection is separate from the mapped-template crosscheck; awaiting its own authoritative parser and acceptance scope.")
    @Test
    void onlyExplicitInstructionCanRequireHeadingWithoutAMappedTemplate() throws Exception {
        var processed = review("sibling-subsection-absent", null,
            "The submission must include the '4. Review Notes' section.");
        // Future separate instructions parser should add an instruction-grounded missing section.
        assertThat(processed.missingRequiredSections()).allSatisfy(section -> {
            assertThat(section.source()).isEqualTo(AiReviewProvider.FindingSource.DELIVERABLE_REQUIREMENTS);
            assertThat("The submission must include the '4. Review Notes' section.")
                .contains(section.requirement());
        });
        assertThat(processed.missingRequiredSections())
            .extracting(AiReviewProvider.MissingRequiredSection::section)
            .anySatisfy(section -> assertThat(section).contains("Review Notes"));
    }
}
