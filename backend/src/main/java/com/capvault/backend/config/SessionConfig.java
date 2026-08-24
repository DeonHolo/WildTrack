package com.capvault.backend.config;

import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SessionConfig {

    @Bean
    Duration wildTrackSessionTtl(WildTrackSessionProperties properties) {
        return properties.ttl();
    }
}
