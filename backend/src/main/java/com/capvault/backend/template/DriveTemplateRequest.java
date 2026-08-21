package com.capvault.backend.template;

import jakarta.validation.constraints.NotBlank;

public record DriveTemplateRequest(
    @NotBlank String deliverableKey,
    String displayName,
    @NotBlank String driveUrl
) {
}
