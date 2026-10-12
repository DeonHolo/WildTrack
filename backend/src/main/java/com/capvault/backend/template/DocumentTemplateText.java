package com.capvault.backend.template;

/** Template authority needed for comparison and AI context, without the original file bytes. */
public record DocumentTemplateText(String extractedText, String sha256) {
}
