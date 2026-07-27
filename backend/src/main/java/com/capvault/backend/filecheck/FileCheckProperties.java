package com.capvault.backend.filecheck;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "capvault.file-check")
public record FileCheckProperties(
    int minimumReadableCharacters,
    double templateCoverageThreshold,
    double maximumAddedContentRatio
) {
}
