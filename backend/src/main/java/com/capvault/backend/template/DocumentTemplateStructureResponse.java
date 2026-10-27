package com.capvault.backend.template;

import java.util.List;
import java.util.UUID;

public record DocumentTemplateStructureResponse(
    UUID templateId,
    String displayName,
    String originalFilename,
    String contentType,
    String extractedText,
    List<String> expectedHeadings,
    List<String> detectedHeadings,
    String sha256
) {}
