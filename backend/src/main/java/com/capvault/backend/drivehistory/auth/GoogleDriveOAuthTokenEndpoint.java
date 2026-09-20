package com.capvault.backend.drivehistory.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** Exchanges authorization codes and refresh tokens; provider response bodies are never included in errors. */
final class GoogleDriveOAuthTokenEndpoint {
    private final RestClient restClient;
    private final DriveOAuthProperties properties;
    private final ObjectMapper mapper;

    GoogleDriveOAuthTokenEndpoint(RestClient restClient, DriveOAuthProperties properties, ObjectMapper mapper) {
        this.restClient = restClient;
        this.properties = properties;
        this.mapper = mapper;
    }

    public record TokenResponse(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("refresh_token") String refreshToken,
        @JsonProperty("id_token") String idToken,
        @JsonProperty("scope") String scope,
        @JsonProperty("expires_in") Integer expiresIn
    ) {
        @Override
        public String toString() { return "TokenResponse[redacted]"; }
    }

    TokenResponse exchange(String code, String codeVerifier) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("code", code);
        form.add("client_id", properties.clientId());
        form.add("client_secret", properties.clientSecret());
        form.add("redirect_uri", properties.redirectUri());
        form.add("code_verifier", codeVerifier);
        form.add("grant_type", "authorization_code");
        return request(form);
    }

    TokenResponse refresh(String refreshToken) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("refresh_token", refreshToken);
        form.add("client_id", properties.clientId());
        form.add("client_secret", properties.clientSecret());
        form.add("grant_type", "refresh_token");
        return request(form);
    }

    private TokenResponse request(LinkedMultiValueMap<String, String> form) {
        try {
            TokenResponse response = restClient.post().uri("/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve().body(TokenResponse.class);
            if (response == null || response.accessToken() == null || response.accessToken().isBlank()) {
                throw new DriveOAuthTokenException(false);
            }
            return response;
        } catch (RestClientResponseException error) {
            boolean revoked = error.getStatusCode().value() == 401;
            if (error.getStatusCode().value() == 400) {
                try {
                    JsonNode root = mapper.readTree(error.getResponseBodyAsByteArray());
                    revoked = "invalid_grant".equals(root.path("error").asText());
                } catch (Exception ignored) { /* Unknown provider errors do not expose response bodies. */ }
            }
            throw new DriveOAuthTokenException(revoked);
        } catch (ResourceAccessException error) {
            throw new DriveOAuthTokenException(false);
        }
    }

    static final class DriveOAuthTokenException extends RuntimeException {
        private final boolean revoked;

        DriveOAuthTokenException(boolean revoked) {
            super("Google Drive authorization is unavailable.");
            this.revoked = revoked;
        }

        boolean revoked() { return revoked; }
    }
}
