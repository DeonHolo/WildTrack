package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

class ProductionProfileContractTest {

    @Test
    void productionProfileUsesHerokuAndPostgresRuntimeContracts() throws IOException {
        List<PropertySource<?>> sources = new YamlPropertySourceLoader().load(
            "production",
            new ClassPathResource("application-production.yml")
        );
        assertThat(sources).hasSize(1);
        PropertySource<?> production = sources.getFirst();

        assertThat(production.getProperty("server.port")).isEqualTo("${PORT:8080}");
        assertThat(production.getProperty("server.forward-headers-strategy")).isEqualTo("framework");
        assertThat(production.getProperty("server.error.include-message")).isEqualTo("never");
        assertThat(production.getProperty("server.error.include-stacktrace")).isEqualTo("never");
        assertThat(production.getProperty("spring.datasource.url"))
            .isEqualTo("${SPRING_DATASOURCE_URL}");
        assertThat(production.getProperty("spring.datasource.username"))
            .isEqualTo("${SPRING_DATASOURCE_USERNAME}");
        assertThat(production.getProperty("spring.datasource.password"))
            .isEqualTo("${SPRING_DATASOURCE_PASSWORD}");
        assertThat(production.getProperty("spring.datasource.hikari.maximum-pool-size"))
            .isEqualTo("${WILDTRACK_DB_MAX_POOL_SIZE:10}");
        assertThat(production.getProperty("spring.h2.console.enabled")).isEqualTo(false);
        assertThat(production.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
        assertThat(production.getProperty("spring.flyway.enabled")).isEqualTo(true);
        assertThat(production.getProperty("wildtrack.session.secure-cookie")).isEqualTo(true);
        assertThat(production.getProperty("wildtrack.google.identity.enabled")).isEqualTo(true);
        assertThat(production.getProperty("capvault.cors.allowed-origins"))
            .isEqualTo("${CAPVAULT_CORS_ALLOWED_ORIGINS:https://wildtrack.dev}");
    }
}
