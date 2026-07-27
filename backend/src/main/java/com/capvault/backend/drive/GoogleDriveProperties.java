package com.capvault.backend.drive;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "capvault.google.drive")
public record GoogleDriveProperties(
    boolean enabled,
    String apiKey,
    long maximumFileSizeBytes
) {
}
