package com.capvault.backend.deliverable;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DeliverableFieldOptionRequest(
    @Size(max = 80) String id,
    @NotBlank @Size(max = 240) String label
) {
}
