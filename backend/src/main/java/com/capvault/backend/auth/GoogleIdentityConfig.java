package com.capvault.backend.auth;

import java.io.IOException;
import java.security.GeneralSecurityException;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(GoogleIdentityProperties.class)
public class GoogleIdentityConfig {

    @Bean
    GoogleCredentialVerifier googleCredentialVerifier(GoogleIdentityProperties properties)
        throws GeneralSecurityException, IOException {
        if (!properties.configured()) {
            return credential -> {
                throw new GoogleIdentityUnavailableException(
                    "Google sign-in is not configured on this machine. Run setup-local.ps1 and restart WildTrack."
                );
            };
        }
        return new GoogleApiCredentialVerifier(properties.clientId());
    }
}
