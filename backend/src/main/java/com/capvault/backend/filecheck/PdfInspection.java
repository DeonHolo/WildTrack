package com.capvault.backend.filecheck;

public record PdfInspection(
    boolean readable,
    boolean encrypted,
    int pageCount,
    int extractedCharacterCount,
    String extractedText,
    String error
) {
}
