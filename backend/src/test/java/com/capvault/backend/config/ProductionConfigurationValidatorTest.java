package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class ProductionConfigurationValidatorTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(ProductionConfigurationValidator.class)
        .withPropertyValues("spring.profiles.active=production");

    @Test
    void productionStartsWithTheCompleteSafeConfigurationContract() {
        contextRunner
            .withPropertyValues(
                "spring.datasource.url=jdbc:postgresql://localhost:5432/wildtrack",
                "spring.datasource.username=wildtrack",
                "spring.datasource.password=not-a-real-password",
                "wildtrack.google.identity.enabled=true",
                "wildtrack.google.identity.client-id=test-client.example.invalid",
                "wildtrack.staff.bootstrap.assignments=ADMIN:admin@example.test",
                "wildtrack.session.secure-cookie=true",
                "capvault.cors.allowed-origins=https://wildtrack.dev"
            )
            .run(context -> assertThat(context).hasNotFailed());
    }

    @Test
    void productionRejectsMissingOrUnsafeConfiguration() {
        contextRunner
            .withPropertyValues(
                "spring.datasource.url=jdbc:h2:mem:unsafe",
                "spring.datasource.username=sa",
                "spring.datasource.password=",
                "wildtrack.google.identity.enabled=false",
                "wildtrack.google.identity.client-id=",
                "wildtrack.staff.bootstrap.assignments=",
                "wildtrack.session.secure-cookie=false",
                "capvault.cors.allowed-origins=http://localhost:5173"
            )
            .run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure())
                    .hasRootCauseInstanceOf(IllegalStateException.class)
                    .rootCause()
                    .hasMessageContaining("Unsafe WildTrack production configuration")
                    .hasMessageContaining("PostgreSQL")
                    .hasMessageContaining("secure cookie")
                    .hasMessageContaining("Google Identity")
                    .hasMessageContaining("staff bootstrap")
                    .hasMessageContaining("HTTPS origin");
            });
    }

    @Test
    void productionRejectsAnyUnsafeOriginInAMixedCorsList() {
        contextRunner
            .withPropertyValues(
                "spring.datasource.url=jdbc:postgresql://localhost:5432/wildtrack",
                "spring.datasource.username=wildtrack",
                "spring.datasource.password=not-a-real-password",
                "wildtrack.google.identity.enabled=true",
                "wildtrack.google.identity.client-id=test-client.example.invalid",
                "wildtrack.staff.bootstrap.assignments=ADMIN:admin@example.test",
                "wildtrack.session.secure-cookie=true",
                "capvault.cors.allowed-origins=https://wildtrack.dev,http://unsafe.example"
            )
            .run(context -> {
                assertThat(context).hasFailed();
                assertThat(context.getStartupFailure())
                    .rootCause()
                    .hasMessageContaining("every CORS origin");
            });
    }

}
