package com.capvault.backend.filecheck;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record FileCheckRequest(
    @NotBlank(message = "Response ID is required")
    @Size(max = 240, message = "Response ID is too long")
    String responseId,

    @NotBlank(message = "Deliverable is required")
    @Size(max = 180, message = "Deliverable key is too long")
    String deliverableKey,

    @NotBlank(message = "Submitted Drive link is required")
    @Size(max = 2048, message = "Submitted Drive link is too long")
    String sourceUrl,

    @Size(max = 80, message = "Response timestamp is too long")
    String sourceResponseUpdatedAt
) {
}
