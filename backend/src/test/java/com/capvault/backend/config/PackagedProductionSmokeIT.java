package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

import javax.sql.DataSource;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.Test;

class PackagedProductionSmokeIT {

    @Test
    void packagedJarStartsOnTheSuppliedPortAndBecomesReady() throws Exception {
        Path jar = Path.of("target", "backend-0.1.0-SNAPSHOT.jar").toAbsolutePath();
        assertThat(jar).isRegularFile();

        try (EmbeddedPostgres postgres = EmbeddedPostgres.builder().start()) {
            DataSource embeddedDataSource = postgres.getPostgresDatabase();
            String jdbcUrl;
            String username;
            try (Connection connection = embeddedDataSource.getConnection()) {
                jdbcUrl = connection.getMetaData().getURL();
                username = connection.getMetaData().getUserName();
            }

            int port = availablePort();
            Path log = Path.of("target", "packaged-production-smoke.log").toAbsolutePath();
            Process process = new ProcessBuilder(
                javaExecutable(),
                "-jar",
                jar.toString(),
                "--spring.profiles.active=production",
                "--server.port=" + port,
                "--spring.datasource.url=" + jdbcUrl,
                "--spring.datasource.username=" + username,
                "--spring.datasource.password=embedded-test-password",
                "--wildtrack.google.identity.enabled=true",
                "--wildtrack.google.identity.client-id=test-client.example.invalid",
                "--wildtrack.staff.bootstrap.assignments=ADMIN:admin@example.test",
                "--wildtrack.session.secure-cookie=true",
                "--capvault.cors.allowed-origins=https://wildtrack.dev",
                "--logging.level.root=WARN"
            )
                .redirectErrorStream(true)
                .redirectOutput(log.toFile())
                .start();

            try {
                HttpResponse<String> readiness = awaitReadiness(process, port, log);
                assertThat(readiness.statusCode()).isEqualTo(200);
                assertThat(readiness.body())
                    .contains("\"status\":\"UP\"")
                    .contains("\"database\":\"UP\"")
                    .doesNotContain("jdbc:")
                    .doesNotContain("production");
            } finally {
                process.destroy();
                if (!process.waitFor(5, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                    process.waitFor(5, TimeUnit.SECONDS);
                }
            }
        }
    }

    private HttpResponse<String> awaitReadiness(Process process, int port, Path log) throws Exception {
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
        URI readinessUri = URI.create("http://127.0.0.1:" + port + "/api/health/ready");
        Instant deadline = Instant.now().plusSeconds(90);
        Exception lastFailure = null;

        while (Instant.now().isBefore(deadline)) {
            if (!process.isAlive()) {
                throw new AssertionError("Packaged backend exited early:\n" + Files.readString(log));
            }
            try {
                return client.send(
                    HttpRequest.newBuilder(readinessUri)
                        .timeout(Duration.ofSeconds(2))
                        .GET()
                        .build(),
                    HttpResponse.BodyHandlers.ofString()
                );
            } catch (Exception exception) {
                lastFailure = exception;
                Thread.sleep(500);
            }
        }

        throw new AssertionError(
            "Packaged backend did not become ready. Last request failure: "
                + lastFailure
                + "\n"
                + Files.readString(log)
        );
    }

    private int availablePort() throws Exception {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    private String javaExecutable() {
        String executable = System.getProperty("os.name").toLowerCase().contains("win")
            ? "java.exe"
            : "java";
        return Path.of(System.getProperty("java.home"), "bin", executable).toString();
    }
}
