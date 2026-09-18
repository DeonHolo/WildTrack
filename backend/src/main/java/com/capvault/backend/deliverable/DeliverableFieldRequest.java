package com.capvault.backend.deliverable;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DeliverableFieldRequest(
    @Size(max = 80) String id,
    @NotBlank @Size(max = 160) String fieldKey,
    @NotBlank @Size(max = 240) String label,
    @Size(max = 1000) String helpText,
    @NotNull DeliverableFieldType fieldType,
    boolean required,
    int displayOrder,
    @NotNull DocumentCheckPolicy documentCheckPolicy,
    boolean aiReviewEnabled,
    boolean active,
    List<@Valid DeliverableFieldOptionRequest> options
) {
    public DeliverableFieldRequest(
        String id,
        String fieldKey,
        String label,
        DeliverableFieldType fieldType,
        boolean required,
        int displayOrder,
        DocumentCheckPolicy documentCheckPolicy,
        boolean aiReviewEnabled,
        boolean active
    ) {
        this(id, fieldKey, label, null, fieldType, required, displayOrder,
            documentCheckPolicy, aiReviewEnabled, active, null);
    }
}
