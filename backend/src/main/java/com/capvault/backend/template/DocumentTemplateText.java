package com.capvault.backend.template;

/** Template authority needed for comparison and AI context, without the original file bytes. */
public record DocumentTemplateText(java.util.UUID id, String extractedText, String sha256) {
    public DocumentTemplateText(String extractedText, String sha256) { this(null, extractedText, sha256); }
}
