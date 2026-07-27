package com.capvault.backend.template;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "capvault.templates")
public record TemplateStorageProperties(
    String storagePath,
    long maximumFileSizeBytes
) {
}
