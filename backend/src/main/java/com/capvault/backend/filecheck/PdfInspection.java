package com.capvault.backend.filecheck;

public record PdfInspection(
    boolean readable,
    boolean encrypted,
    int pageCount,
    int textBearingPageCount,
    int extractedCharacterCount,
    String extractedText,
    String error
) {
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
            error
        );
    }
}
