package com.capvault.backend.drivehistory.auth;

import java.net.URI;
import java.util.Base64;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wildtrack.drive-history.oauth")
public record DriveOAuthProperties(
    boolean enabled,
    String clientId,
    String clientSecret,
    String redirectUri,
    String frontendOrigin,
    String encryptionKeyBase64,
    boolean secureCookie
) {
    public static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";

    public boolean configured() {
        if (!enabled || blank(clientId) || blank(clientSecret) || blank(redirectUri)
                || blank(frontendOrigin) || blank(encryptionKeyBase64)) return false;
        try {
            URI redirect = URI.create(redirectUri);
            URI frontend = URI.create(frontendOrigin);
            byte[] key = Base64.getDecoder().decode(encryptionKeyBase64);
            return key.length == 32
                && validHttpsOrLoopback(redirect) && validHttpsOrLoopback(frontend)
                && (!"https".equalsIgnoreCase(redirect.getScheme()) || secureCookie)
                && "/api/drive-history/auth/callback".equals(redirect.getPath())
                && redirect.getRawQuery() == null && redirect.getRawFragment() == null
                && (frontend.getPath() == null || frontend.getPath().isEmpty() || "/".equals(frontend.getPath()))
                && frontend.getRawQuery() == null && frontend.getRawFragment() == null;
        } catch (RuntimeException invalidConfiguration) {
            return false;
        }
    }

    private static boolean validHttpsOrLoopback(URI uri) {
        if (uri.getHost() == null || uri.getUserInfo() != null) return false;
        if ("https".equalsIgnoreCase(uri.getScheme())) return true;
        return "http".equalsIgnoreCase(uri.getScheme())
            && ("localhost".equalsIgnoreCase(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
