package com.capvault.backend.auth;

import java.util.Locale;

import org.springframework.stereotype.Service;

@Service
public class GoogleIdentityService {

    private final GoogleCredentialVerifier verifier;

    GoogleIdentityService(GoogleCredentialVerifier verifier) {
        this.verifier = verifier;
    }

    public GoogleIdentity authenticate(String credential) {
        if (credential == null || credential.isBlank()) {
            throw new InvalidGoogleCredentialException("Google did not return a sign-in credential.");
        }
        GoogleIdentity identity = verifier.verify(credential.trim());
        if (identity.subject() == null || identity.subject().isBlank()
            || identity.email() == null || identity.email().isBlank()) {
            throw new InvalidGoogleCredentialException("Google sign-in did not include a usable account identity.");
        }
        return new GoogleIdentity(
            identity.subject(),
            identity.email().trim().toLowerCase(Locale.ROOT),
            identity.name() == null ? "" : identity.name().trim(),
            identity.pictureUrl() == null ? "" : identity.pictureUrl().trim()
        );
    }
}
