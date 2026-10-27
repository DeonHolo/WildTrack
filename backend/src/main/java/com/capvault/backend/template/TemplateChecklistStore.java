package com.capvault.backend.template;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class TemplateChecklistStore {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public TemplateChecklistStore(JdbcTemplate db, ObjectMapper json) { this.db = db; this.json = json; }
    public JdbcTemplate database() { return db; }
    public String encode(List<TemplateInstructionProtocol.Draft> items) {
        try { return json.writeValueAsString(items); } catch (Exception e) { throw new IllegalStateException(e); }
    }
    public List<TemplateInstructionProtocol.Draft> decode(String value) {
        try { return List.copyOf(json.readValue(value, new TypeReference<List<TemplateInstructionProtocol.Draft>>() {})); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    public void lock(UUID workspace, UUID template) {
        db.query("SELECT id FROM academic_document_templates WHERE workspace_id = ? AND id = ? FOR UPDATE", rs -> {}, workspace, template);
    }
    public Optional<Row> find(UUID version) {
        expire();
        return db.query("SELECT revision,state,items_json,approved_at,approval_hash,error,claim_token,retry_token FROM template_checklists WHERE version_id = ?",
            (rs, n) -> new Row(version, rs.getLong(1), rs.getString(2), decode(rs.getString(3)),
                rs.getTimestamp(4) == null ? null : rs.getTimestamp(4).toInstant(), rs.getString(5), rs.getString(6),
                rs.getObject(7, UUID.class), rs.getObject(8, UUID.class)), version).stream().findFirst();
    }
    public void expire() {
        db.update("UPDATE template_checklists SET state='FAILED', error='OUTCOME_UNKNOWN', claim_token=NULL, updated_at=CURRENT_TIMESTAMP WHERE state='PREPARING' AND lease_until < CURRENT_TIMESTAMP");
    }
    @Transactional
    public Optional<Job> claim() {
        expire();
        var ids = db.query("SELECT version_id FROM template_checklists WHERE state='QUEUED' ORDER BY updated_at FETCH FIRST 1 ROW ONLY", (rs,n)->rs.getObject(1, UUID.class));
        if (ids.isEmpty()) return Optional.empty();
        UUID token = UUID.randomUUID(), version = ids.get(0);
        if (db.update("UPDATE template_checklists SET state='PREPARING',claim_token=?,lease_until=CURRENT_TIMESTAMP + INTERVAL '20' MINUTE,updated_at=CURRENT_TIMESTAMP WHERE version_id=? AND state='QUEUED'", token, version) != 1) return Optional.empty();
        return db.query("SELECT v.workspace_id,v.template_id,v.source_sha256,c.retry_token FROM academic_document_template_versions v JOIN template_checklists c ON c.version_id=v.id WHERE v.id=?", (rs,n)->new Job(version, token, rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3), rs.getObject(4, UUID.class)), version).stream().findFirst();
    }
    public void finish(Job job, List<TemplateInstructionProtocol.Draft> items) {
        db.update("UPDATE template_checklists SET state='DRAFT',revision=revision+1,items_json=?,claim_token=NULL,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE version_id=? AND state='PREPARING' AND claim_token=?", encode(items),job.version(),job.claim());
    }
    public void fail(Job job, String error) {
        db.update("UPDATE template_checklists SET state='FAILED',error=?,claim_token=NULL,updated_at=CURRENT_TIMESTAMP WHERE version_id=? AND state='PREPARING' AND claim_token=?", error,job.version(),job.claim());
    }
    public void heartbeat(Job job) {
        if (db.update("UPDATE template_checklists SET lease_until=CURRENT_TIMESTAMP + INTERVAL '20' MINUTE WHERE version_id=? AND state='PREPARING' AND claim_token=?",
            job.version(), job.claim()) != 1) throw new TemplateInstructionPreparation.Failure("OUTCOME_UNKNOWN");
    }
    public record Row(UUID version,long revision,String state,List<TemplateInstructionProtocol.Draft> items,Instant approvedAt,String hash,String error,UUID claim,UUID retry) {}
    public record Job(UUID version,UUID claim,UUID workspace,UUID template,String sourceHash,UUID retry) {}
}
