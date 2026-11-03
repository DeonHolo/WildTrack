package com.capvault.backend.aireview;

import com.capvault.backend.filecheck.PdfInspection;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;

/** Per-review reference views. The original Document Check extraction is never replaced. */
final class AiReviewQuotationSource {
    private static final int MAX_READING_ORDER_CHARACTERS = 2_000_000;
    private final byte[] pdf;
    private final PdfInspection inspection;
    private List<PdfInspection.PageText> readingOrder;

    AiReviewQuotationSource(byte[] pdf, PdfInspection inspection) {
        this.pdf = pdf;
        this.inspection = inspection;
    }

    AiReviewQuotationLocator.Match locate(String quotation, AiReviewProvider.EvidenceLocation hint) {
        if (quotation == null || quotation.isBlank()) return AiReviewQuotationLocator.Match.absent();
        var exact = AiReviewQuotationLocator.exact(quotation, inspection.extractedText(), inspection.pages(), hint);
        if (exact.located()) return exact;
        var visualPages = readingOrderPages();
        exact = AiReviewQuotationLocator.exact(quotation, "", visualPages, hint);
        if (exact.located()) return exact;
        var close = AiReviewQuotationLocator.closest(quotation, inspection.pages(), hint);
        return close.located() ? close : AiReviewQuotationLocator.closest(quotation, visualPages, hint);
    }

    private List<PdfInspection.PageText> readingOrderPages() {
        if (readingOrder != null) return readingOrder;
        // Optional fallback, calculated once across all instruction groups. No OCR or image rendering.
        readingOrder = List.of();
        if (pdf == null || pdf.length < 5 || !inspection.readable()) return readingOrder;
        try (var document = Loader.loadPDF(pdf)) {
            if (document.isEncrypted() || document.getNumberOfPages() != inspection.pageCount()) return readingOrder;
            var stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            var pages = new ArrayList<PdfInspection.PageText>();
            int characters = 0;
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String text = stripper.getText(document);
                characters += text.length();
                if (characters > MAX_READING_ORDER_CHARACTERS) return readingOrder;
                pages.add(new PdfInspection.PageText(page, text, false));
            }
            readingOrder = List.copyOf(pages);
        } catch (IOException | RuntimeException unavailable) {
            // A failed optional view must not discard the review or its original text references.
        }
        return readingOrder;
    }
}
