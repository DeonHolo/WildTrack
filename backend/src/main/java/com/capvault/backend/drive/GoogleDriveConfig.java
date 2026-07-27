package com.capvault.backend.drive;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(GoogleDriveProperties.class)
public class GoogleDriveConfig {

    @Bean
    RestClient googleDriveRestClient(RestClient.Builder builder) {
        return builder.baseUrl("https://www.googleapis.com").build();
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
