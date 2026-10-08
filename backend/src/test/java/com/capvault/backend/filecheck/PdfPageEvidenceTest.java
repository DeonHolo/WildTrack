package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.junit.jupiter.api.Test;

class PdfPageEvidenceTest {
    @Test void keepsPhysicalPageNumbersAcrossBlankAndImageOnlyPages() throws Exception {
        try (var document = new PDDocument()) {
            var first = new PDPage();
            document.addPage(first);
            writeText(document, first, "1.1. Purpose", "Students submit project documents for university review.");
            document.addPage(new PDPage());
            var third = new PDPage();
            document.addPage(third);
            try (var content = new PDPageContentStream(document, third)) {
                var image = new BufferedImage(32, 32, BufferedImage.TYPE_INT_RGB);
                content.drawImage(LosslessFactory.createFromImage(document, image), 40, 100, 120, 120);
            }
            var bytes = new ByteArrayOutputStream();
            document.save(bytes);
            var inspection = new PdfInspector().inspect(bytes.toByteArray());

            assertThat(inspection.readable()).isTrue();
            assertThat(inspection.pageCount()).isEqualTo(3);
            assertThat(inspection.textBearingPageCount()).isEqualTo(1);
            assertThat(inspection.pages()).extracting(PdfInspection.PageText::pageNumber)
                .containsExactly(1, 2, 3);
            assertThat(inspection.pages().get(0).text()).contains("1.1. Purpose");
            assertThat(inspection.pages().get(1).text()).isBlank();
            assertThat(inspection.pages().get(2).text()).isBlank();
            assertThat(inspection.pages().get(2).hasVisualContent()).isTrue();
            // A visual hint does not add invented text or promote screening substance.
            assertThat(inspection.extractedText()).doesNotContain("Diagram", "Wireframe");
        }
    }

    @Test void retainsSourceWhitespaceForEvidenceWhileKeepingLegacyMetricsNormalized() throws Exception {
        try (var document = new PDDocument()) {
            var page = new PDPage();
            document.addPage(page);
            writeText(document, page, "1.2. Scope", "First authored paragraph.", "Second authored paragraph.");
            var bytes = new ByteArrayOutputStream();
            document.save(bytes);
            var inspection = new PdfInspector().inspect(bytes.toByteArray());

            assertThat(inspection.pages()).hasSize(1);
            assertThat(inspection.pages().get(0).text().lines().toList())
                .contains("First authored paragraph.", "Second authored paragraph.");
            assertThat(inspection.extractedCharacterCount()).isEqualTo(inspection.extractedText().length());
            assertThat(inspection.extractedText()).contains("1.2. Scope", "Second authored paragraph.");
        }
    }

    @Test void legacyInspectionConstructorDoesNotInventPageProvenance() {
        var inspection = new PdfInspection(true, false, 3, 2, 28, "Previously extracted document", "");
        assertThat(inspection.pages()).isEmpty();
        assertThat(inspection.textBearingPageCount()).isEqualTo(2);
        assertThat(new PdfInspector().inspect(new byte[] {1, 2, 3}).readable()).isFalse();
    }

    private static void writeText(PDDocument document, PDPage page, String... lines) throws Exception {
        try (var content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setLeading(18);
            content.newLineAtOffset(40, 700);
            for (String line : lines) {
                content.showText(line);
                content.newLine();
            }
            content.endText();
        }
    }
}
