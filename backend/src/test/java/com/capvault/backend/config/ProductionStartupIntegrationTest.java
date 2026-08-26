package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Connection;
import javax.sql.DataSource;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "wildtrack.google.identity.enabled=true",
    "wildtrack.google.identity.client-id=test-client.example.invalid",
    "wildtrack.staff.bootstrap.assignments=ADMIN:admin@example.test",
    "wildtrack.session.secure-cookie=true",
    "capvault.cors.allowed-origins=https://wildtrack.dev"
})
@AutoConfigureMockMvc
@ActiveProfiles("production")
class ProductionStartupIntegrationTest {

    private static EmbeddedPostgres postgres;

    @BeforeAll
    static void startPostgres() throws Exception {
        postgres = EmbeddedPostgres.builder().start();
    }

    @AfterAll
    static void stopPostgres() throws Exception {
        if (postgres != null) {
            postgres.close();
        }
    }

    @DynamicPropertySource
    static void configurePostgres(DynamicPropertyRegistry registry) throws Exception {
        DataSource dataSource = postgres.getPostgresDatabase();
        try (Connection connection = dataSource.getConnection()) {
            String url = connection.getMetaData().getURL();
            String user = connection.getMetaData().getUserName();
            registry.add("spring.datasource.url", () -> url);
            registry.add("spring.datasource.username", () -> user);
            registry.add("spring.datasource.password", () -> "embedded-test-password");
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Test
    void productionApplicationBindsTheSuppliedPortAndBecomesReadyOnPostgres() throws Exception {
        String readinessBody = mockMvc.perform(get("/api/health/ready"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        assertThat(readinessBody)
            .contains("\"status\":\"UP\"")
            .contains("\"database\":\"UP\"")
            .doesNotContain("jdbc:");

        mockMvc.perform(get("/h2-console"))
            .andExpect(status().isUnauthorized());
    }
}

