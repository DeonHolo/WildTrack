package com.capvault.backend.drivehistory.auth;

import java.time.Duration;
import java.io.IOException;
import java.security.GeneralSecurityException;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(DriveOAuthProperties.class)
public class DriveOAuthConfig {
    @Bean
    DriveOAuthIdentityVerifier delegatedDriveIdentityVerifier(DriveOAuthProperties properties)
        throws GeneralSecurityException, IOException {
        if (!properties.configured()) {
            return idToken -> { throw new IllegalArgumentException("Drive history consent is not configured."); };
        }
        return new GoogleDriveOAuthIdentityVerifier(properties.clientId());
    }

    @Bean
    GoogleDriveOAuthTokenEndpoint delegatedGoogleOAuthTokens(
        RestClient.Builder builder, DriveOAuthProperties properties, ObjectMapper objectMapper
    ) {
        RestClient client = builder.baseUrl("https://oauth2.googleapis.com")
            .requestFactory(ClientHttpRequestFactories.get(ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(Duration.ofSeconds(5))
                .withReadTimeout(Duration.ofSeconds(15)))).build();
        return new GoogleDriveOAuthTokenEndpoint(client, properties, objectMapper);
    }

    @Bean
    DelegatedDriveGateway delegatedDriveGateway(RestClient.Builder builder) {
        RestClient client = builder.baseUrl("https://www.googleapis.com")
            .requestFactory(ClientHttpRequestFactories.get(ClientHttpRequestFactorySettings.DEFAULTS
                .withConnectTimeout(Duration.ofSeconds(5))
                .withReadTimeout(Duration.ofSeconds(20)))).build();
        return new GoogleDelegatedDriveGateway(client);
    }
}
