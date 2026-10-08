package com.capvault.backend.filecheck;

import java.util.List;

public record PdfInspection(
    boolean readable,
    boolean encrypted,
    int pageCount,
    int textBearingPageCount,
    int extractedCharacterCount,
    String extractedText,
    String error,
    List<PageText> pages
) {
    public record PageText(int pageNumber, String text, boolean hasVisualContent) { }

    public PdfInspection {
        pages = pages == null ? List.of() : List.copyOf(pages);
    }

    public PdfInspection(
        boolean readable,
        boolean encrypted,
        int pageCount,
        int textBearingPageCount,
        int extractedCharacterCount,
        String extractedText,
        String error
    ) {
        this(readable, encrypted, pageCount, textBearingPageCount, extractedCharacterCount,
            extractedText, error, List.of());
    }

    public PdfInspection(
        boolean readable,
        boolean encrypted,
        int pageCount,
        int extractedCharacterCount,
        String extractedText,
        String error
    ) {
        this(
            readable,
            encrypted,
            pageCount,
            readable && extractedCharacterCount > 0 ? pageCount : 0,
            extractedCharacterCount,
            extractedText,
            error,
            List.of()
        );
    }
}
