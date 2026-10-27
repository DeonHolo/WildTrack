package com.capvault.backend.template;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TemplateChecklistService {
    private final TemplateChecklistStore store;
    private final TemplatePdfStore pdfs;
    private final TemplateInstructionStore instructions;
    public TemplateChecklistService(TemplateChecklistStore store, TemplatePdfStore pdfs, TemplateInstructionStore instructions) {
        this.store=store; this.pdfs=pdfs; this.instructions=instructions;
    }
    public record View(UUID versionId,long revision,String state,Integer pdfPages,List<TemplateInstructionProtocol.Draft> items,Instant approvedAt,String error) {}
    public record Approved(UUID versionId,String pdfSha256,byte[] pdf,List<TemplateInstructionPreparation.Instruction> instructions,String fingerprint) {}
    public record BatchItem(UUID templateId,UUID versionId,long revision,String title,String state,String pdfState,String error) {}
    public record BatchRequest(UUID templateId,UUID versionId,long expectedRevision) {}
    @Transactional(readOnly = true)
    public List<BatchItem> batch(UUID workspace) {
        return store.database().query("""
            SELECT t.id,v.id,COALESCE(c.revision,0),t.display_name,
                   COALESCE(c.state,'UNPREPARED'),COALESCE(v.pdf_state,'UNAVAILABLE'),c.error
            FROM academic_document_templates t
            LEFT JOIN academic_document_template_versions v ON v.template_id=t.id
                AND v.workspace_id=t.workspace_id AND v.source_sha256=t.sha256
            LEFT JOIN template_checklists c ON c.version_id=v.id
            WHERE t.workspace_id=? ORDER BY t.deliverable_key,t.id
            """, (rs,n) -> new BatchItem(rs.getObject(1,UUID.class),rs.getObject(2,UUID.class),
                rs.getLong(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7)),workspace);
    }
    @Transactional
    public List<BatchItem> requestBatch(UUID workspace,List<BatchRequest> selected) {
        if (selected==null || selected.isEmpty() || selected.stream().anyMatch(item -> item==null
            || item.templateId()==null || item.versionId()==null || item.expectedRevision()<0)
            || selected.stream().map(BatchRequest::templateId).distinct().count()!=selected.size())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Select valid templates to prepare.");
        // One transaction queues the whole selection; stable lock order avoids batch deadlocks.
        for (var item:selected.stream().sorted(java.util.Comparator.comparing(BatchRequest::templateId)).toList())
            requestPreparation(workspace,item.templateId(),item.versionId(),item.expectedRevision());
        return batch(workspace);
    }
    private ResponseStatusException conflict() { return new ResponseStatusException(HttpStatus.CONFLICT,"The template or checklist changed. Reload and try again."); }
    private TemplatePdfStore.Status current(UUID workspace, UUID id, UUID version) {
        var current=pdfs.current(workspace,id);
        if (!current.versionId().equals(version) || !"READY".equals(current.state())) throw conflict();
        return current;
    }
    private TemplateChecklistStore.Row checked(UUID version,long revision) {
        var row=store.find(version).orElse(null);
        if ((row == null ? 0 : row.revision()) != revision) throw conflict();
        return row;
    }
    public View get(UUID workspace,UUID id) {
        var pdf=pdfs.current(workspace,id);
        return view(pdf,store.find(pdf.versionId()).orElse(null));
    }
    private View view(TemplatePdfStore.Status pdf,TemplateChecklistStore.Row row) {
        return row == null ? new View(pdf.versionId(),0,"UNPREPARED",pdf.pages(),List.of(),null,null)
            : new View(pdf.versionId(),row.revision(),row.state(),pdf.pages(),row.items(),row.approvedAt(),row.error());
    }
    @Transactional
    public View requestPreparation(UUID workspace,UUID id,UUID version,long revision) {
        store.lock(workspace,id); var pdf=current(workspace,id,version); var row=checked(version,revision);
        if (row != null && (row.state().equals("QUEUED") || row.state().equals("PREPARING"))) return view(pdf,row);
        if (row != null && !row.state().equals("FAILED")) throw conflict();
        UUID retry=instructions.find(version).filter(s -> "FAILED".equals(s.state())).map(TemplateInstructionStore.State::token).orElse(null);
        if (row == null) store.database().update("INSERT INTO template_checklists(version_id,revision,state,items_json,retry_token) VALUES (?,1,'QUEUED','[]',?)",version,retry);
        else store.database().update("UPDATE template_checklists SET state='QUEUED',revision=revision+1,error=NULL,retry_token=?,updated_at=CURRENT_TIMESTAMP WHERE version_id=?",retry,version);
        return view(pdf,store.find(version).orElseThrow());
    }
    @Transactional
    public View save(UUID workspace,UUID id,UUID version,long revision,List<TemplateInstructionProtocol.Draft> items) {
        store.lock(workspace,id); var pdf=current(workspace,id,version); var row=checked(version,revision);
        if (row != null && (row.state().equals("QUEUED") || row.state().equals("PREPARING"))) throw conflict();
        validate(items,pdf.pages()); String encoded=store.encode(items);
        if (row == null) store.database().update("INSERT INTO template_checklists(version_id,revision,state,items_json) VALUES (?,1,'DRAFT',?)",version,encoded);
        else store.database().update("UPDATE template_checklists SET revision=revision+1,state='DRAFT',items_json=?,approved_at=NULL,approval_hash=NULL,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE version_id=?",encoded,version);
        return view(pdf,store.find(version).orElseThrow());
    }
    @Transactional
    public View approve(UUID workspace,UUID id,UUID version,long revision,String subject) {
        store.lock(workspace,id); var pdf=current(workspace,id,version); var row=checked(version,revision);
        if (row == null || !row.state().equals("DRAFT") || row.items().isEmpty() || subject == null || subject.isBlank()) throw conflict();
        validate(row.items(),pdf.pages()); String encoded=store.encode(row.items()); long next=revision+1;
        String hash=hash(version+":"+next+":"+encoded);
        store.database().update("INSERT INTO template_checklist_approvals(version_id,revision,actor,approved_at,items_json,fingerprint) VALUES (?,?,?,CURRENT_TIMESTAMP,?,?)",version,next,subject,encoded,hash);
        store.database().update("UPDATE template_checklists SET state='APPROVED',revision=?,approved_at=CURRENT_TIMESTAMP,approval_hash=?,updated_at=CURRENT_TIMESTAMP WHERE version_id=?",next,hash,version);
        return view(pdf,store.find(version).orElseThrow());
    }
    public String fingerprint(UUID workspace,UUID id) {
        var p=pdfs.current(workspace,id); var r=store.find(p.versionId()).orElse(null);
        return hash(p.versionId()+":"+(r==null?"UNPREPARED:0":r.state()+":"+r.revision()+":"+r.hash()));
    }
    @Transactional
    public Approved approved(UUID workspace,UUID id,String expectedSourceHash) {
        store.lock(workspace,id); var p=pdfs.current(workspace,id); var r=store.find(p.versionId()).orElse(null);
        if (!p.sourceSha256().equals(expectedSourceHash) || !"READY".equals(p.state()) || r==null || !"APPROVED".equals(r.state())) throw conflict();
        var snapshots=store.database().query("SELECT items_json FROM template_checklist_approvals WHERE version_id=? AND revision=? AND fingerprint=?",(rs,n)->store.decode(rs.getString(1)),p.versionId(),r.revision(),r.hash());
        if (snapshots.isEmpty()) throw conflict();
        var result=new ArrayList<TemplateInstructionPreparation.Instruction>();
        var list=snapshots.get(0); for(int i=0;i<list.size();i++) result.add(new TemplateInstructionPreparation.Instruction("T"+(i+1),list.get(i)));
        var pdf=pdfs.readPdf(workspace,id,p.versionId());
        return new Approved(p.versionId(),pdf.sha256(),pdf.bytes(),List.copyOf(result),fingerprint(workspace,id));
    }
    private void validate(List<TemplateInstructionProtocol.Draft> items,Integer pages) {
        if (items == null || pages == null || new HashSet<>(items).size() != items.size()) throw invalid();
        for (var i:items) {
            if (i==null || !valid(i.title(),160,true) || !valid(i.instruction(),32000,true) || !valid(i.sourceQuote(),32000,true)
                || !valid(i.section(),2000,false) || !valid(i.condition(),32000,false) || i.page()<1 || i.page()>pages || i.applicability()==null
                || (i.applicability()==TemplateInstructionProtocol.Applicability.CONDITIONAL ? i.condition()==null || i.condition().isBlank() : i.condition()!=null && !i.condition().isBlank())) throw invalid();
        }
        if (store.encode(items).getBytes(StandardCharsets.UTF_8).length > 2_000_000) throw invalid();
    }
    private boolean valid(String s,int max,boolean required) { return s==null ? !required : s.length()<=max && (!required || !s.isBlank()); }
    private ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid checklist items."); }
    private static String hash(String value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); } catch(Exception e) { throw new IllegalStateException(e); } }
}
