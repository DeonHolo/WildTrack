package com.capvault.backend.drivehistory.auth;

/** Verifies the callback ID token against the dedicated OAuth Web client audience. */
@FunctionalInterface
interface DriveOAuthIdentityVerifier {
    String verifiedSubject(String idToken);
}
