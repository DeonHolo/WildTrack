package com.capvault.backend.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "wildtrack.session")
public record WildTrackSessionProperties(
    Duration ttl,
    Boolean secureCookie,
    String cookieDomain
) {
    public WildTrackSessionProperties {
        if (ttl == null || ttl.isNegative() || ttl.isZero()) {
            ttl = Duration.ofHours(12);
        }
        if (secureCookie == null) {
            secureCookie = false;
        }
        if (cookieDomain == null) {
            cookieDomain = "";
        }
    }

    public boolean secure() {
        return Boolean.TRUE.equals(secureCookie);
    }
}
