package com.capvault.backend.auth;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.List;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;

final class GoogleApiCredentialVerifier implements GoogleCredentialVerifier {

    private final GoogleIdTokenVerifier verifier;

    GoogleApiCredentialVerifier(String clientId) throws GeneralSecurityException, IOException {
        verifier = new GoogleIdTokenVerifier.Builder(
            GoogleNetHttpTransport.newTrustedTransport(),
            GsonFactory.getDefaultInstance()
        )
            .setAudience(List.of(clientId))
            .build();
    }

    @Override
    public GoogleIdentity verify(String credential) {
        try {
            GoogleIdToken token = verifier.verify(credential);
            if (token == null) {
                throw new InvalidGoogleCredentialException("Google sign-in could not be verified.");
            }
            GoogleIdToken.Payload payload = token.getPayload();
            if (!Boolean.TRUE.equals(payload.getEmailVerified())) {
                throw new InvalidGoogleCredentialException("Google has not verified this account email.");
            }
            return new GoogleIdentity(
                payload.getSubject(),
                payload.getEmail(),
                stringClaim(payload, "name"),
                stringClaim(payload, "picture")
            );
        } catch (GeneralSecurityException | IOException | IllegalArgumentException exception) {
            throw new InvalidGoogleCredentialException("Google sign-in could not be verified.", exception);
        }
    }

    private static String stringClaim(GoogleIdToken.Payload payload, String key) {
        Object value = payload.get(key);
        return value == null ? "" : String.valueOf(value);
    }
}
