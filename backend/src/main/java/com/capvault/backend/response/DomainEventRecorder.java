package com.capvault.backend.response;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Append-only domain history and pending tracker work join the caller's database transaction. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class DomainEventRecorder {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Clock clock;

    public DomainEventRecorder(JdbcTemplate jdbc, ObjectMapper mapper, Clock clock) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.clock = clock;
    }

    public void record(UUID workspaceId, UUID targetId, String actor, String action, Map<String, ?> details) {
        try {
            jdbc.update("INSERT INTO domain_audit_events (id, workspace_id, target_id, actor_subject, action, details_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), workspaceId, targetId, actor, action, mapper.writeValueAsString(details), now());
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("Audit details could not be serialized.", error);
        }
    }

    public void responseSaved(FormResponse response) {
        record(response.getWorkspaceId(), response.getId(), response.getGoogleSubject(), "RESPONSE_SAVED",
            Map.of("revision", response.getRevision(), "deliverableId", response.getDeliverableId()));
        // A later worker must resolve canonical eligibility before writing to Sheets.
        // Recording pending work never performs a remote write in the response transaction.
        jdbc.update("INSERT INTO response_tracker_outbox (id, workspace_id, response_id, response_revision, status, created_at) VALUES (?, ?, ?, ?, 'PENDING', ?)",
            UUID.randomUUID(), response.getWorkspaceId(), response.getId(), response.getRevision(), now());
    }

    private OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }
}
