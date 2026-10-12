package com.capvault.backend.drivehistory.auth;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.List;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.GoogleIdentityService;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;

/** Validates Google's signature, issuer, expiration, and the configured history Web OAuth client audience. */
final class GoogleDriveOAuthIdentityVerifier implements DriveOAuthIdentityVerifier {
    private final GoogleIdTokenVerifier verifier;

    GoogleDriveOAuthIdentityVerifier(String oauthClientId) throws GeneralSecurityException, IOException {
        verifier = new GoogleIdTokenVerifier.Builder(
            GoogleNetHttpTransport.newTrustedTransport(), GsonFactory.getDefaultInstance()
        ).setAudience(List.of(oauthClientId)).build();
    }

    GoogleDriveOAuthIdentityVerifier(GoogleIdTokenVerifier verifier) { this.verifier = verifier; }

    @Override
    public String verifiedSubject(String idToken) {
        return verifiedPayload(idToken).getSubject();
    }

    @Override
    public GoogleIdentity verifiedIdentity(String idToken, String expectedNonce) {
        GoogleIdToken.Payload payload = verifiedPayload(idToken);
        String nonce = stringClaim(payload, "nonce");
        if (!Boolean.TRUE.equals(payload.getEmailVerified()) || payload.getEmail() == null
            || payload.getEmail().isBlank() || payload.getEmail().length() > 320
            || payload.getSubject().length() > 255 || expectedNonce == null || expectedNonce.isBlank()
            || !MessageDigest.isEqual(nonce.getBytes(StandardCharsets.UTF_8),
                expectedNonce.getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("Google sign-in identity could not be verified.");
        }
        return GoogleIdentityService.normalize(new GoogleIdentity(payload.getSubject(), payload.getEmail(),
            stringClaim(payload, "name"), stringClaim(payload, "picture")));
    }

    private GoogleIdToken.Payload verifiedPayload(String idToken) {
        if (idToken == null || idToken.isBlank()) {
            throw new IllegalArgumentException("Missing Google callback identity.");
        }
        try {
            GoogleIdToken token = verifier.verify(idToken);
            if (token == null || token.getPayload() == null || token.getPayload().getSubject() == null
                || token.getPayload().getSubject().isBlank()) {
                throw new IllegalArgumentException("Google callback identity could not be verified.");
            }
            return token.getPayload();
        } catch (GeneralSecurityException | IOException invalidIdentity) {
            throw new IllegalArgumentException("Google callback identity could not be verified.");
        }
    }

    private static String stringClaim(GoogleIdToken.Payload payload, String key) {
        Object value = payload.get(key);
        return value == null ? "" : String.valueOf(value);
    }
}
