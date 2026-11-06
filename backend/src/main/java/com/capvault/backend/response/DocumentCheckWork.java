package com.capvault.backend.response;

import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.filecheck.FileCheckRequest;
import com.capvault.backend.filecheck.FileCheckService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Deterministic Document Check work survives a committed submission and process interruption. */
@Service
public class DocumentCheckWork {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final FileCheckService checks;
    private final FormResponseRepository responses;
    private final DeliverableFieldRepository fields;
    private final ObjectMapper json;
    private final boolean enabled;
    private final AtomicBoolean waking = new AtomicBoolean();
    private final java.util.concurrent.ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "document-check-work"); thread.setDaemon(true); return thread;
    });
    private record Row(UUID id, UUID workspace, FileCheckRequest request, long revision, int attempts, UUID token) { }

    public DocumentCheckWork(JdbcTemplate db, PlatformTransactionManager manager, Clock clock,
            FileCheckService checks, FormResponseRepository responses, DeliverableFieldRepository fields,
            ObjectMapper json, @Value("${capvault.document-check.worker-enabled:true}") boolean enabled) {
        this.db=db; this.clock=clock; this.checks=checks; this.responses=responses; this.fields=fields;
        this.json=json; this.enabled=enabled; this.tx=new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(UUID workspace, FileCheckRequest request) {
        UUID response = UUID.fromString(request.responseId());
        Long revision = db.queryForObject("SELECT revision FROM form_responses WHERE id=? AND workspace_id=?",
            Long.class, response, workspace);
        db.update("""
            INSERT INTO document_check_work(id,workspace_id,response_id,field_id,source_revision,request_json,next_attempt_at)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING
            """, UUID.randomUUID(), workspace, response, Objects.requireNonNullElse(request.fieldId(), ""),
            revision, encode(request), Timestamp.from(clock.instant()));
        if (enabled) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { wake(); }
        });
    }

    @Scheduled(fixedDelayString = "${capvault.document-check.worker-delay-ms:2000}")
    public void scheduled() { if (enabled) wake(); }

    private void wake() {
        if (!waking.compareAndSet(false, true)) return;
        try { executor.execute(() -> { try { for (int i=0; i<10 && runOne(); i++) { } } finally { waking.set(false); } }); }
        catch (java.util.concurrent.RejectedExecutionException stopped) { waking.set(false); }
    }

    public boolean runOne() {
        Row row=claim();
        if (row==null) return false;
        FileCheckRequest request = currentRequest(row);
        if (request == null) { finish(row,"SUPERSEDED"); return true; }
        try {
            var report = checks.check(row.workspace(),request);
            if (report != null && report.failureDetails() != null && retryable(report.failureDetails().code())) retry(row);
            else finish(row,"SUCCEEDED");
        } catch (RuntimeException failure) {
            retry(row);
        }
        return true;
    }

    private static boolean retryable(String code) {
        return code != null && java.util.Set.of("RATE_LIMIT", "PROVIDER_ERROR", "UPSTREAM_ERROR", "TIMEOUT",
            "DNS_FAILURE", "CONNECTION_FAILURE", "TLS_FAILURE", "TRANSPORT_ERROR").contains(code);
    }

    private void retry(Row row) {
        if (row.attempts()>=3) finish(row,"FAILED");
        else tx.executeWithoutResult(s -> db.update("""
                UPDATE document_check_work SET status='PENDING',next_attempt_at=?,lease_token=NULL,lease_until=NULL
                WHERE id=? AND status='RUNNING' AND lease_token=?
                """, Timestamp.from(clock.instant().plusSeconds(30L*row.attempts())),row.id(),row.token()));
    }

    private Row claim() {
        return tx.execute(s -> {
            Timestamp now=Timestamp.from(clock.instant());
            var ids=db.query("""
                SELECT id FROM document_check_work WHERE (status='PENDING' AND next_attempt_at<=?)
                  OR (status='RUNNING' AND lease_until<?) ORDER BY next_attempt_at,id FETCH FIRST 20 ROWS ONLY
                """,(rs,n)->rs.getObject(1,UUID.class),now,now);
            for (UUID id:ids) {
                UUID token=UUID.randomUUID();
                if (db.update("""
                    UPDATE document_check_work SET status='RUNNING',attempts=attempts+1,lease_token=?,lease_until=?
                    WHERE id=? AND ((status='PENDING' AND next_attempt_at<=?) OR (status='RUNNING' AND lease_until<?))
                    """,token,Timestamp.from(clock.instant().plusSeconds(180)),id,now,now)!=1) continue;
                return db.queryForObject("SELECT workspace_id,request_json,source_revision,attempts FROM document_check_work WHERE id=?",
                    (rs,n)->new Row(id,rs.getObject(1,UUID.class),decode(rs.getString(2)),rs.getLong(3),rs.getInt(4),token),id);
            }
            return null;
        });
    }

    private FileCheckRequest currentRequest(Row row) {
        var response=responses.findById(UUID.fromString(row.request().responseId())).orElse(null);
        if (response==null || !row.workspace().equals(response.getWorkspaceId()) || !response.isCurrentResponse()) return null;
        try {
            String key="documentPdf";
            if (row.request().fieldId()!=null) {
                var field=fields.findById(row.request().fieldId()).filter(f -> f.isActive()
                    && f.getFieldType() == com.capvault.backend.deliverable.DeliverableFieldType.DRIVE_PDF
                    && f.getDocumentCheckPolicy() == com.capvault.backend.deliverable.DocumentCheckPolicy.AUTO
                    && response.getDeliverableId().equals(f.getDeliverableId())).orElse(null);
                if (field==null) return null;
                key=field.getFieldKey();
            }
            if (!row.request().sourceUrl().equals(json.readTree(response.getValuesJson()).path(key).asText("").trim())) return null;
            // Text-only edits and database timestamp precision must not discard the pending PDF check.
            return new FileCheckRequest(row.request().responseId(), row.request().fieldId(), row.request().deliverableKey(),
                row.request().sourceUrl(), Objects.requireNonNullElse(response.getUpdatedAt(), response.getSubmittedAt()).toString());
        } catch (Exception invalid) { return null; }
    }

    private void finish(Row row,String status) {
        tx.executeWithoutResult(s -> db.update("UPDATE document_check_work SET status=?,lease_token=NULL,lease_until=NULL WHERE id=? AND status='RUNNING' AND lease_token=?",
            status,row.id(),row.token()));
    }
    private String encode(FileCheckRequest request) {
        try { return json.writeValueAsString(request); } catch (Exception failure) { throw new IllegalStateException("Document Check could not be queued.",failure); }
    }
    private FileCheckRequest decode(String request) {
        try { return json.readValue(request,FileCheckRequest.class); } catch (Exception failure) { throw new IllegalStateException("Saved Document Check work could not be read.",failure); }
    }
    @PreDestroy void shutdown() { executor.shutdownNow(); }
}
