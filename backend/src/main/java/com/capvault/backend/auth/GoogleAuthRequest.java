package com.capvault.backend.auth;

import jakarta.validation.constraints.NotBlank;

public record GoogleAuthRequest(
    @NotBlank(message = "Google sign-in credential is required.") String credential
) {
}
