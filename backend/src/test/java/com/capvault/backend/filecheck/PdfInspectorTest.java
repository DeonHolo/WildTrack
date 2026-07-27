package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

class PdfInspectorTest {

    private final PdfInspector inspector = new PdfInspector();

    @Test
    void extractsReadableTextAndPageCount() throws Exception {
        byte[] pdf = readablePdf("Software Requirements Specification for CapVault.");

        PdfInspection result = inspector.inspect(pdf);

        assertThat(result.readable()).isTrue();
        assertThat(result.encrypted()).isFalse();
        assertThat(result.pageCount()).isEqualTo(1);
        assertThat(result.extractedText()).contains("Software Requirements Specification");
    }

    @Test
    void rejectsBytesThatAreNotPdfData() {
        PdfInspection result = inspector.inspect("not a pdf".getBytes());

        assertThat(result.readable()).isFalse();
        assertThat(result.error()).contains("not valid PDF");
    }

    private static byte[] readablePdf(String text) throws Exception {
        try (PDDocument document = new PDDocument();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(72, 720);
                content.showText(text);
                content.endText();
            }
            document.save(output);
            return output.toByteArray();
        }
    }
}
