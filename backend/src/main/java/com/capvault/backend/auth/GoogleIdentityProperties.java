package com.capvault.backend.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wildtrack.google.identity")
public record GoogleIdentityProperties(
    boolean enabled,
    String clientId
) {
    public boolean configured() {
        return enabled && clientId != null && !clientId.isBlank();
    }
}
