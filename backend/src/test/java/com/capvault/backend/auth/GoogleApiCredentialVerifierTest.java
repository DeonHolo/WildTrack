package com.capvault.backend.auth;

import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class GoogleApiCredentialVerifierTest {

    @Test
    void rejectsMalformedCredentialsAsAuthenticationFailures() throws Exception {
        GoogleApiCredentialVerifier verifier = new GoogleApiCredentialVerifier("test-client-id");

        assertThrows(
            InvalidGoogleCredentialException.class,
            () -> verifier.verify("invalid-test-token")
        );
    }
}
