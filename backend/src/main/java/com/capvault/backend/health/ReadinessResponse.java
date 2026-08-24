package com.capvault.backend.health;

import java.time.Instant;

public record ReadinessResponse(
    String status,
    String service,
    String database,
    Instant checkedAt
) {
}
