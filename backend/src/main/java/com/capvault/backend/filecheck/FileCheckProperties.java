package com.capvault.backend.filecheck;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;

@ConfigurationProperties(prefix = "capvault.file-check")
public record FileCheckProperties(
    int minimumReadableCharacters,
    double templateCoverageThreshold,
    double maximumAddedContentRatio,
    int minimumAssessableCharacters,
    int minimumSubstantialCharacters,
    double minimumTextPageRatio,
    int minimumCharactersPerTextBearingPage,
    double minimumSubstanceAddedContentRatio,
    double minimumSubstanceCharacterGrowthRatio
) {
    @ConstructorBinding
    public FileCheckProperties {
    }

    public FileCheckProperties(
        int minimumReadableCharacters,
        double templateCoverageThreshold,
        double maximumAddedContentRatio
    ) {
        this(
            minimumReadableCharacters,
            templateCoverageThreshold,
            maximumAddedContentRatio,
            40,
            1500,
            0.50,
            300,
            0.55,
            1.75
        );
    }
}
