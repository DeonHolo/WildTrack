package com.capvault.backend.template;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Paid preparation is checkpointed between requests, never inside an open DB transaction. */
@Repository
public class TemplateInstructionStore {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public TemplateInstructionStore(JdbcTemplate db, ObjectMapper json) { this.db = db; this.json = json; }

    public Optional<State> find(UUID versionId) {
        // A crashed request may have reached Gemini. Require an explicit retry, not a scheduled replay.
        db.update("""
            UPDATE template_instruction_sets SET state = 'FAILED', failure_code = 'OUTCOME_UNKNOWN',
                updated_at = CURRENT_TIMESTAMP
            WHERE version_id = ? AND protocol_version = ? AND state = 'PROCESSING'
              AND lease_until < CURRENT_TIMESTAMP
            """, versionId, TemplateInstructionProtocol.VERSION);
        return db.query("""
            SELECT state, claim_token, completed_page, items_json, request_count, failure_code
            FROM template_instruction_sets WHERE version_id = ? AND protocol_version = ?
            """, (rs, row) -> new State(versionId, rs.getString(1), rs.getObject(2, UUID.class),
                rs.getInt(3), decode(rs.getString(4)), rs.getInt(5), rs.getString(6)),
            versionId, TemplateInstructionProtocol.VERSION).stream().findFirst();
    }

    public Optional<State> claim(UUID versionId, String providerVersion, UUID expectedRetryToken) {
        UUID token = UUID.randomUUID();
        int created = db.update("""
            INSERT INTO template_instruction_sets(version_id, protocol_version, state, claim_token, lease_until, provider_version)
            VALUES (?, ?, 'PROCESSING', ?, CURRENT_TIMESTAMP + INTERVAL '15' MINUTE, ?) ON CONFLICT DO NOTHING
            """, versionId, TemplateInstructionProtocol.VERSION, token, providerVersion);
        if (created == 0) {
            if (expectedRetryToken == null) return Optional.empty();
            if (db.update("""
                UPDATE template_instruction_sets SET state = 'PROCESSING', claim_token = ?,
                    lease_until = CURRENT_TIMESTAMP + INTERVAL '15' MINUTE,
                    failure_code = NULL, provider_version = ?, updated_at = CURRENT_TIMESTAMP
                WHERE version_id = ? AND protocol_version = ? AND state = 'FAILED' AND claim_token = ?
                """, token, providerVersion, versionId, TemplateInstructionProtocol.VERSION, expectedRetryToken) != 1)
                return Optional.empty();
        }
        return find(versionId).filter(state -> token.equals(state.token()));
    }

    public boolean startRequest(State state) {
        return db.update("""
            UPDATE template_instruction_sets SET request_count = request_count + 1,
                lease_until = CURRENT_TIMESTAMP + INTERVAL '15' MINUTE, updated_at = CURRENT_TIMESTAMP
            WHERE version_id = ? AND protocol_version = ? AND state = 'PROCESSING' AND claim_token = ?
            """, state.versionId(), TemplateInstructionProtocol.VERSION, state.token()) == 1;
    }

    public boolean checkpoint(State state, int completedPage, List<TemplateInstructionProtocol.Draft> items, boolean done) {
        return db.update("""
            UPDATE template_instruction_sets SET completed_page = ?, items_json = ?, state = ?,
                lease_until = CURRENT_TIMESTAMP + INTERVAL '15' MINUTE, updated_at = CURRENT_TIMESTAMP
            WHERE version_id = ? AND protocol_version = ? AND state = 'PROCESSING'
              AND claim_token = ? AND completed_page = ?
            """, completedPage, encode(items), done ? "READY" : "PROCESSING", state.versionId(),
            TemplateInstructionProtocol.VERSION, state.token(), state.completedPage()) == 1;
    }

    public void fail(State state, String code) {
        db.update("""
            UPDATE template_instruction_sets SET state = 'FAILED', failure_code = ?, updated_at = CURRENT_TIMESTAMP
            WHERE version_id = ? AND protocol_version = ? AND state = 'PROCESSING' AND claim_token = ?
            """, code, state.versionId(), TemplateInstructionProtocol.VERSION, state.token());
    }

    private String encode(List<TemplateInstructionProtocol.Draft> items) {
        try { return json.writeValueAsString(items); }
        catch (Exception failure) { throw new IllegalStateException("Instruction checkpoint could not be encoded."); }
    }
    private List<TemplateInstructionProtocol.Draft> decode(String value) {
        try { return List.copyOf(json.readValue(value, new TypeReference<List<TemplateInstructionProtocol.Draft>>() {})); }
        catch (Exception failure) { throw new IllegalStateException("Instruction checkpoint could not be read."); }
    }
    public record State(UUID versionId, String state, UUID token, int completedPage,
                        List<TemplateInstructionProtocol.Draft> items, int requestCount, String failureCode) { }
}
