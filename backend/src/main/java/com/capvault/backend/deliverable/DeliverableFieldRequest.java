package com.capvault.backend.deliverable;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DeliverableFieldRequest(
    @Size(max = 80) String id,
    @NotBlank @Size(max = 160) String fieldKey,
    @NotBlank @Size(max = 240) String label,
    @NotNull DeliverableFieldType fieldType,
    boolean required,
    int displayOrder,
    @NotNull DocumentCheckPolicy documentCheckPolicy,
    boolean aiReviewEnabled,
    boolean active
) {
}
