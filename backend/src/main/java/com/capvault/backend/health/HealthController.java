package com.capvault.backend.health;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Instant;

import javax.sql.DataSource;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    private static final String SERVICE = "wildtrack-backend";
    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping({"", "/live"})
    HealthResponse live() {
        return new HealthResponse("UP", SERVICE, Instant.now());
    }

    @GetMapping("/ready")
    ResponseEntity<ReadinessResponse> ready() {
        boolean databaseReady = databaseIsReady();
        ReadinessResponse response = new ReadinessResponse(
            databaseReady ? "UP" : "DOWN",
            SERVICE,
            databaseReady ? "UP" : "DOWN",
            Instant.now()
        );
        return ResponseEntity.status(databaseReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
            .body(response);
    }

    private boolean databaseIsReady() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(2);
        } catch (SQLException exception) {
            return false;
        }
    }
}
