package com.capvault.backend.drivehistory.auth;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;

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

    @Override
    public String verifiedSubject(String idToken) {
        if (idToken == null || idToken.isBlank()) {
            throw new IllegalArgumentException("Missing Google callback identity.");
        }
        try {
            GoogleIdToken token = verifier.verify(idToken);
            if (token == null || token.getPayload() == null || token.getPayload().getSubject() == null
                || token.getPayload().getSubject().isBlank()) {
                throw new IllegalArgumentException("Google callback identity could not be verified.");
            }
            return token.getPayload().getSubject();
        } catch (GeneralSecurityException | IOException invalidIdentity) {
            throw new IllegalArgumentException("Google callback identity could not be verified.");
        }
    }
}
