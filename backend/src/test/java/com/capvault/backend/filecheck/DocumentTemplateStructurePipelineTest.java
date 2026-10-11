package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import com.capvault.backend.template.DocumentTextExtractor;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

class DocumentTemplateStructurePipelineTest {
    private final TemplateComparator comparator = new TemplateComparator(new FileCheckProperties(300, .75, .25));

    @Test
    void wordTocPageNumbersMatchActualPdfBodyHeadings() throws Exception {
        var result = compare("1. Introduction\nActual overview\n2. Test Plan\nActual plan\n3. Test Cases\nActual cases");

        assertThat(result.expectedTemplateHeadings()).containsExactly("Introduction", "Test Plan", "Test Cases");
        assertThat(result.detectedTemplateHeadings()).containsExactlyElementsOf(result.expectedTemplateHeadings());
        assertThat(result.missingTemplateHeadings()).isEmpty();
    }

    @Test
    void pdfTocAloneDoesNotSatisfyTemplateBodySections() throws Exception {
        var result = compare("Table of Contents\n1. Introduction 4\n2. Test Plan 5\n3. Test Cases 6");

        assertThat(result.detectedTemplateHeadings()).isEmpty();
        assertThat(result.missingTemplateHeadings()).containsExactly("Introduction", "Test Plan", "Test Cases");
    }

    @Test
    void completeTocStillExposesOneMissingBodySection() throws Exception {
        var result = compare("Table of Contents\n1. Introduction 4\n2. Test Plan 5\n3. Test Cases 6\n"
            + "1. Introduction\nActual overview\n3. Test Cases\nActual cases");

        assertThat(result.detectedTemplateHeadings()).containsExactly("Introduction", "Test Cases");
        assertThat(result.missingTemplateHeadings()).containsExactly("Test Plan");
    }

    private TemplateComparison compare(String submittedText) throws Exception {
        try (XWPFDocument docx = new XWPFDocument(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            for (String text : new String[] {"Table of Contents", "1. Introduction\t4", "2. Test Plan\t5",
                "3. Test Cases\t6", "Introduction", "Overview instructions.", "Test Plan", "Plan instructions.",
                "Test Cases", "Case instructions."}) {
                docx.createParagraph().createRun().setText(text);
            }
            docx.write(bytes);
            String template = new DocumentTextExtractor().extract(bytes.toByteArray(), "template.docx", null);
            PdfInspection pdf = new PdfInspector().inspect(pdf(submittedText));
            assertThat(pdf.readable()).isTrue();
            return comparator.compare(template, pdf.extractedText());
        }
    }

    private static byte[] pdf(String text) throws Exception {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (var stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.setLeading(16);
                stream.newLineAtOffset(40, 740);
                for (String line : text.split("\n")) {
                    stream.showText(line);
                    stream.newLine();
                }
                stream.endText();
            }
            document.save(bytes);
            return bytes.toByteArray();
        }
    }
}
