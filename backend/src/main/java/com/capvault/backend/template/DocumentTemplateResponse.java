package com.capvault.backend.template;

import java.time.LocalDateTime;
import java.util.UUID;

public record DocumentTemplateResponse(
    UUID id,
    UUID workspaceId,
    String deliverableKey,
    String displayName,
    String originalFilename,
    String contentType,
    String sha256,
    int extractedCharacterCount,
    LocalDateTime updatedAt
) {
    static DocumentTemplateResponse from(DocumentTemplate template) {
        return new DocumentTemplateResponse(
            template.getId(),
            template.getWorkspaceId(),
            template.getDeliverableKey(),
            template.getDisplayName(),
            template.getOriginalFilename(),
            template.getContentType(),
            template.getSha256(),
            template.getExtractedCharacterCount(),
            template.getUpdatedAt()
        );
    }
}
