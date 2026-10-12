package com.capvault.backend.drivehistory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class GoogleDriveOAuthIdentityVerifierTest {
    @Test
    void fullLoginIdentityUsesTrustedVerifierVerifiedEmailAndBoundOidcNonce() throws Exception {
        GoogleIdTokenVerifier trusted = mock(GoogleIdTokenVerifier.class);
        GoogleIdToken token = mock(GoogleIdToken.class);
        var payload = new GoogleIdToken.Payload().setSubject("subject-one")
            .setEmail(" Student@Example.Invalid ").setEmailVerified(true);
        payload.set("nonce", "browser-nonce").set("name", " Student ").set("picture", " https://example.invalid/photo ");
        when(token.getPayload()).thenReturn(payload);
        when(trusted.verify("signed-id-token")).thenReturn(token);
        var verifier = new GoogleDriveOAuthIdentityVerifier(trusted);
        var identity = verifier.verifiedIdentity("signed-id-token", "browser-nonce");
        assertThat(identity.subject()).isEqualTo("subject-one");
        assertThat(identity.email()).isEqualTo("student@example.invalid");
        assertThat(identity.name()).isEqualTo("Student");
        verify(trusted).verify("signed-id-token");
        assertThatThrownBy(() -> verifier.verifiedIdentity("signed-id-token", "another-browser"))
            .isInstanceOf(IllegalArgumentException.class);
        payload.setEmailVerified(false);
        assertThatThrownBy(() -> verifier.verifiedIdentity("signed-id-token", "browser-nonce"))
            .isInstanceOf(IllegalArgumentException.class);
        payload.setEmailVerified(true).setEmail("");
        assertThatThrownBy(() -> verifier.verifiedIdentity("signed-id-token", "browser-nonce"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectedSignatureIssuerAudienceOrExpiryCannotBecomeLoginIdentity() throws Exception {
        GoogleIdTokenVerifier trusted = mock(GoogleIdTokenVerifier.class);
        when(trusted.verify("rejected-id-token")).thenReturn(null);
        var verifier = new GoogleDriveOAuthIdentityVerifier(trusted);
        assertThatThrownBy(() -> verifier.verifiedIdentity("rejected-id-token", "nonce"))
            .isInstanceOf(IllegalArgumentException.class);
        verify(trusted).verify("rejected-id-token");
    }

    @Test
    void trustedVerifierAudienceIsTheDedicatedDriveClient() throws Exception {
        var verifier = new GoogleDriveOAuthIdentityVerifier("dedicated-drive-client");
        var trusted = (GoogleIdTokenVerifier) ReflectionTestUtils.getField(verifier, "verifier");
        assertThat(trusted.getAudience()).containsExactly("dedicated-drive-client");
    }
}
