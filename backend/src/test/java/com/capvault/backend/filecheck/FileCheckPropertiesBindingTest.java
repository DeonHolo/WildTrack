package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class FileCheckPropertiesBindingTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(TestConfiguration.class)
        .withPropertyValues(
            "capvault.file-check.minimum-readable-characters=300",
            "capvault.file-check.template-coverage-threshold=0.75",
            "capvault.file-check.maximum-added-content-ratio=0.25",
            "capvault.file-check.minimum-assessable-characters=40",
            "capvault.file-check.minimum-substantial-characters=1500",
            "capvault.file-check.minimum-text-page-ratio=0.50",
            "capvault.file-check.minimum-characters-per-text-bearing-page=300",
            "capvault.file-check.minimum-substance-added-content-ratio=0.55",
            "capvault.file-check.minimum-substance-character-growth-ratio=1.75"
        );

    @Test
    void bindsAllSubmissionSubstanceThresholdsThroughSpringConfigurationProperties() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(FileCheckProperties.class);

            FileCheckProperties properties = context.getBean(FileCheckProperties.class);
            assertThat(properties.minimumReadableCharacters()).isEqualTo(300);
            assertThat(properties.templateCoverageThreshold()).isEqualTo(0.75);
            assertThat(properties.maximumAddedContentRatio()).isEqualTo(0.25);
            assertThat(properties.minimumAssessableCharacters()).isEqualTo(40);
            assertThat(properties.minimumSubstantialCharacters()).isEqualTo(1500);
            assertThat(properties.minimumTextPageRatio()).isEqualTo(0.50);
            assertThat(properties.minimumCharactersPerTextBearingPage()).isEqualTo(300);
            assertThat(properties.minimumSubstanceAddedContentRatio()).isEqualTo(0.55);
            assertThat(properties.minimumSubstanceCharacterGrowthRatio()).isEqualTo(1.75);
        });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(FileCheckProperties.class)
    static class TestConfiguration {
    }
}
