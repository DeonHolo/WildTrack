package com.capvault.backend.aireview;

import static com.capvault.backend.aireview.AiReviewProvider.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.capvault.backend.filecheck.PdfInspector;
import java.io.ByteArrayOutputStream;
import java.util.List;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

class AiReviewQuotationSourceTest {
    private static final String START = "The application displays hardware telemetry and the latest diagnostic result,";
    private static final String END = "warning signs, remediation availability, and the overall action status.";

    @Test void recoversExactCrossPageQuoteWhenAnEarlierTableWasDrawnAfterTheParagraph() throws Exception {
        byte[] pdf = document(false);
        var inspection = new PdfInspector().inspect(pdf);
        assertThat(inspection.pages().getFirst().text().indexOf(START))
            .isLessThan(inspection.pages().getFirst().text().indexOf("Unrelated service table"));
        var before = AiReviewQuotationLocator.locate(START + " " + END, inspection.extractedText(), inspection.pages(), new EvidenceLocation(1, null));
        assertThat(before.located()).isFalse();

        var match = new AiReviewQuotationSource(pdf, inspection).locate(START + " " + END, new EvidenceLocation(1, null));
        assertThat(match.located()).isTrue();
        assertThat(match.continuous()).isFalse();
        assertThat(match.approximate()).isFalse();
        assertThat(match.excerpts()).extracting(e -> e.location().page()).containsExactly(1, 2);
        assertThat(match.excerpts().getFirst().text()).contains(START).doesNotContain("Unrelated service table");
        assertThat(match.excerpts().getLast().text()).contains(END);
        assertThat(inspection.pages().getFirst().text().indexOf(START))
            .isLessThan(inspection.pages().getFirst().text().indexOf("Unrelated service table"));
    }

    @Test void visualOrderMustNotSkipInterveningBodyTextOrMoveAQuoteBetweenNonAdjacentPages() throws Exception {
        byte[] pdf = document(true);
        var inspection = new PdfInspector().inspect(pdf);
        assertThat(new AiReviewQuotationSource(pdf, inspection).locate(START + " " + END, new EvidenceLocation(1, null)).located()).isFalse();
    }

    @Test void cachedReferencesCanBeRelocatedWithoutChangingTheAssessmentOrDuplicatingFindings() throws Exception {
        byte[] pdf = document(false);
        var inspection = new PdfInspector().inspect(pdf);
        String quotation = START + " " + END;
        var row = new CriterionAssessment("T1", "Describe the dashboard.", FindingSource.OFFICIAL_TEMPLATE,
            CoverageStatus.ISSUE_RECORDED, List.of(), List.of(0), List.of(), List.of(), CriterionAssessmentLabel.NEEDS_ATTENTION,
            "The dashboard description needs a named user role.", null, null, "Dashboard", List.of(),
            new EvidenceVerification(QuotationStatus.NOT_LOCATED, quotation, new EvidenceLocation(1, null)));
        var raw = new Result("Review", List.of(new Finding(row.explanation(), FindingSource.OFFICIAL_TEMPLATE, "", row.requirement())),
            List.of(), List.of(), "Inspect the PDF", List.of(), List.of(), ReviewOutcome.ISSUES_IDENTIFIED,
            new ReviewCoverage(List.of(row), 0, 1, null, ""));
        var result = AiReviewInstructionEvidencePolicy.locate(raw, inspection, new AiReviewQuotationSource(pdf, inspection));
        assertThat(result.coverage().criteria().getFirst().evidenceVerification().status()).isEqualTo(QuotationStatus.SEPARATE_EXCERPTS);
        assertThat(result.coverage().criteria().getFirst().assessment()).isEqualTo(row.assessment());
        assertThat(result.coverage().criteria().getFirst().explanation()).isEqualTo(row.explanation());
        assertThat(result.findings()).hasSize(1);
        assertThat(result.outcome()).isEqualTo(ReviewOutcome.ISSUES_IDENTIFIED);
    }

    @Test void unavailableOptionalPdfViewStillUsesOriginalReferences() {
        var inspection = new com.capvault.backend.filecheck.PdfInspection(true, false, 1, 1, START.length(), START, null,
            List.of(new com.capvault.backend.filecheck.PdfInspection.PageText(1, START, false)));
        var source = new AiReviewQuotationSource("invalid bytes".getBytes(java.nio.charset.StandardCharsets.UTF_8), inspection);
        assertThat(source.locate("Invented quotation that is nowhere in the submitted document.", null).located()).isFalse();
        assertThat(source.locate(START, null).continuous()).isTrue();
    }

    private static byte[] document(boolean interveningBody) throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            var first = new PDPage(); var second = new PDPage();
            document.addPage(first); document.addPage(second);
            try (var content = new PDPageContentStream(document, first)) {
                text(content, START, 100);
                // PDF producers may draw a top-of-page table after the paragraph in the content stream.
                text(content, "Unrelated service table", interveningBody ? 70 : 700);
            }
            try (var content = new PDPageContentStream(document, second)) { text(content, END, 700); }
            document.save(output);
            return output.toByteArray();
        }
    }

    private static void text(PDPageContentStream content, String value, float y) throws Exception {
        content.beginText();
        content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
        content.newLineAtOffset(50, y);
        content.showText(value);
        content.endText();
    }
}
