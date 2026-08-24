package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Connection;

import javax.sql.DataSource;

import com.capvault.backend.CapVaultBackendApplication;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

class ProductionStartupIntegrationTest {

    @Test
    void productionApplicationBindsTheSuppliedPortAndBecomesReadyOnPostgres() throws Exception {
        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().start()) {
            DataSource embeddedDataSource = postgres.getPostgresDatabase();
            String jdbcUrl;
            String username;
            try (Connection connection = embeddedDataSource.getConnection()) {
                jdbcUrl = connection.getMetaData().getURL();
                username = connection.getMetaData().getUserName();
            }

            int port = availablePort();
            SpringApplication application = new SpringApplication(CapVaultBackendApplication.class);
            try (ConfigurableApplicationContext context = application.run(
                "--spring.profiles.active=production",
                "--server.port=" + port,
                "--spring.datasource.url=" + jdbcUrl,
                "--spring.datasource.username=" + username,
                "--spring.datasource.password=embedded-test-password",
                "--wildtrack.google.identity.enabled=true",
                "--wildtrack.google.identity.client-id=test-client.example.invalid",
                "--wildtrack.staff.bootstrap.assignments=ADMIN:admin@example.test",
                "--wildtrack.session.secure-cookie=true",
                "--capvault.cors.allowed-origins=https://wildtrack.dev"
            )) {
                HttpClient client = HttpClient.newHttpClient();
                HttpResponse<String> readiness = client.send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/health/ready"))
                        .GET()
                        .build(),
                    HttpResponse.BodyHandlers.ofString()
                );
                HttpResponse<String> h2Console = client.send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/h2-console"))
                        .GET()
                        .build(),
                    HttpResponse.BodyHandlers.ofString()
                );

                assertThat(readiness.statusCode()).isEqualTo(200);
                assertThat(readiness.body())
                    .contains("\"status\":\"UP\"")
                    .contains("\"database\":\"UP\"")
                    .doesNotContain("jdbc:")
                    .doesNotContain("production");
                assertThat(h2Console.statusCode()).isEqualTo(404);
            }
        }
    }

    private int availablePort() throws Exception {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }
}
