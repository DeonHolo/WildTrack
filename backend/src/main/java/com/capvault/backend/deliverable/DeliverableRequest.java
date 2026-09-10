package com.capvault.backend.deliverable;

import java.time.LocalDateTime;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DeliverableRequest(
    @NotBlank(message = "Tracker column is required")
    @Size(max = 160, message = "Tracker column is too long")
    String trackerColumnKey,

    @NotBlank(message = "Title is required")
    @Size(max = 240, message = "Title is too long")
    String title,

    @Size(max = 180, message = "Slug is too long")
    String slug,

    @Size(max = 4000, message = "Instructions are too long")
    String instructions,

    @NotNull(message = "Due date is required")
    LocalDateTime dueAt,

    boolean pdfRequired,

    DeliverableStatus status,

    List<@Valid DeliverableFieldRequest> fields
) {
}
