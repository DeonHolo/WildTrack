package com.capvault.backend.deliverable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record DeliverableResponse(
    UUID id,
    String trackerColumnKey,
    String title,
    String slug,
    String instructions,
    LocalDateTime dueAt,
    boolean pdfRequired,
    DeliverableStatus status,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    List<DeliverableFieldResponse> fields,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String sharePath
) {

    public static DeliverableResponse from(
        Deliverable deliverable,
        List<DeliverableFieldResponse> fields
    ) {
        return new DeliverableResponse(
            deliverable.getId(),
            deliverable.getTrackerColumnKey(),
            deliverable.getTitle(),
            deliverable.getSlug(),
            deliverable.getInstructions(),
            deliverable.getDueAt(),
            deliverable.isPdfRequired(),
            deliverable.getStatus(),
            deliverable.getCreatedAt(),
            deliverable.getUpdatedAt(),
            fields,
            null
        );
    }

    public DeliverableResponse withSharePath(String path) {
        return new DeliverableResponse(id, trackerColumnKey, title, slug, instructions, dueAt, pdfRequired,
            status, createdAt, updatedAt, fields, path);
    }
}
