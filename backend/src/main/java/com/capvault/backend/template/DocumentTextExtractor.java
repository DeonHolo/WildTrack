package com.capvault.backend.template;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.springframework.stereotype.Component;

@Component
public class DocumentTextExtractor {

    public String extract(byte[] bytes, String filename, String contentType) {
        String lowerName = filename.toLowerCase(Locale.ROOT);
        try {
            if (lowerName.endsWith(".docx") || isDocx(contentType)) {
                return normalize(extractDocx(bytes));
            }
            if (lowerName.endsWith(".pdf") || "application/pdf".equalsIgnoreCase(contentType)) {
                return normalize(extractPdf(bytes));
            }
        } catch (IOException | RuntimeException exception) {
            throw new IllegalArgumentException("The template could not be read. Upload a valid DOCX or PDF file.");
        }
        throw new IllegalArgumentException("Upload an official template as a DOCX or PDF file.");
    }

    private static String extractDocx(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            StringBuilder text = new StringBuilder();
            document.getParagraphs().forEach(paragraph -> append(text, paragraph.getText()));
            for (XWPFTable table : document.getTables()) {
                table.getRows().forEach(row ->
                    row.getTableCells().forEach(cell -> append(text, cell.getText()))
                );
            }
            return text.toString();
        }
    }

    private static String extractPdf(byte[] bytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            if (document.isEncrypted()) {
                throw new IllegalArgumentException("Password-protected templates are not supported.");
            }
            return new PDFTextStripper().getText(document);
        }
    }

    private static boolean isDocx(String contentType) {
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            .equalsIgnoreCase(contentType);
    }

    private static void append(StringBuilder output, String value) {
        if (value != null && !value.isBlank()) {
            output.append(value.trim()).append('\n');
        }
    }

    private static String normalize(String value) {
        return value
            .replace('\u00A0', ' ')
            .replaceAll("[\\t\\x0B\\f\\r ]+", " ")
            .replaceAll("\\n{3,}", "\n\n")
            .trim();
    }
}
