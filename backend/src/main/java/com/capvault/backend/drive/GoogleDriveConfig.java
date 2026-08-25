package com.capvault.backend.drive;

import java.time.Duration;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(GoogleDriveProperties.class)
public class GoogleDriveConfig {

    @Bean
    RestClient googleDriveRestClient(RestClient.Builder builder) {
        return builder
            .baseUrl("https://www.googleapis.com")
            .requestFactory(ClientHttpRequestFactories.get(ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(Duration.ofSeconds(5))
                .withReadTimeout(Duration.ofSeconds(20))))
            .build();
    }

    @Bean
    GoogleDriveGateway googleDriveGateway(
        GoogleDriveProperties properties,
        RestClient googleDriveRestClient
    ) {
        if (!properties.enabled() || properties.apiKey() == null || properties.apiKey().isBlank()) {
            return new DisabledGoogleDriveGateway();
        }
        return new GoogleDriveApiGateway(properties, googleDriveRestClient);
    }
}
