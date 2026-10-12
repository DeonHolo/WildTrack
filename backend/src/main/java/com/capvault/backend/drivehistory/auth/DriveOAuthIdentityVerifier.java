package com.capvault.backend.drivehistory.auth;

import com.capvault.backend.auth.GoogleIdentity;

/** Verifies the callback ID token against the dedicated OAuth Web client audience. */
@FunctionalInterface
interface DriveOAuthIdentityVerifier {
    String verifiedSubject(String idToken);

    /** LOGIN needs full verified identity and the OIDC nonce, not just a decoded subject. */
    default GoogleIdentity verifiedIdentity(String idToken, String expectedNonce) {
        throw new IllegalArgumentException("Google sign-in identity could not be verified.");
    }
}
