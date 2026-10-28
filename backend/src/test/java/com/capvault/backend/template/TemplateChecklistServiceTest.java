package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.*;
import static com.capvault.backend.support.AuthenticatedRequest.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:template-checklist-approval;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;DEFAULT_NULL_ORDERING=HIGH",
    "capvault.templates.pdf-preparation-enabled=false",
    "capvault.templates.checklist-preparation-enabled=false"
})
class TemplateChecklistServiceTest {
    private static final UUID WORKSPACE = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private final String key = "CHECKLIST-" + UUID.randomUUID();
    @Autowired DocumentTemplateService templates;
    @Autowired TemplatePdfStore pdfs;
    @Autowired TemplatePdfPreparation pdfPreparation;
    @Autowired TemplateChecklistService service;
    @Autowired TemplateChecklistStore store;
    @Autowired TemplateInstructionStore instructions;
    @Autowired JdbcTemplate db;
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;
    @Autowired StaffRoleAssignmentRepository assignments;

    @Test
    void savesApprovesAndRetainsHistoryAcrossEditsAndReplacement() throws Exception {
        UUID id = upload("one");
        pdfPreparation.prepareNext();
        var source = pdfs.current(WORKSPACE, id);
        var items = IntStream.range(0, 30).mapToObj(i -> item("Item " + i, 1, "")).toList();
        var draft = service.save(WORKSPACE, id, source.versionId(), 0, items);
        assertThat(draft.items()).hasSize(30);
        assertThatThrownBy(() -> service.approve(WORKSPACE, id, source.versionId(), 0, "admin"))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        var approved = service.approve(WORKSPACE, id, source.versionId(), draft.revision(), "admin");
        var snapshot = service.approved(WORKSPACE, id, source.sourceSha256());
        assertThat(snapshot.instructions()).hasSize(30);
        assertThat(snapshot.fingerprint()).isEqualTo(service.fingerprint(WORKSPACE, id));
        var edited = service.save(WORKSPACE, id, source.versionId(), approved.revision(), List.of(item("Changed", 1, "")));
        assertThat(edited.state()).isEqualTo("DRAFT");
        assertThatThrownBy(() -> service.approved(WORKSPACE, id, source.sourceSha256())).hasMessageContaining("409");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM template_checklist_approvals WHERE version_id=?", Integer.class, source.versionId())).isEqualTo(1);
        upload("two");
        pdfPreparation.prepareNext();
        assertThat(service.get(WORKSPACE, id).state()).isEqualTo("UNPREPARED");
        assertThatThrownBy(() -> service.save(WORKSPACE, id, source.versionId(), edited.revision(), items)).hasMessageContaining("409");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM template_checklist_approvals WHERE version_id=?", Integer.class, source.versionId())).isEqualTo(1);
    }
    @Test
    void unapprovalKeepsItemsAndApprovalHistoryButBlocksNewReviewUse() throws Exception {
        UUID id=upload("unapprove"), version=pdfs.current(WORKSPACE,id).versionId();
        var items=List.of(item("Retained instruction",1,""));
        var draft=service.save(WORKSPACE,id,version,0,items);
        var approved=service.approve(WORKSPACE,id,version,draft.revision(),"admin");
        String fingerprint=service.fingerprint(WORKSPACE,id);
        assertThatThrownBy(()->service.unapprove(WORKSPACE,id,version,approved.revision()-1)).hasMessageContaining("409");
        var unapproved=service.unapprove(WORKSPACE,id,version,approved.revision());
        assertThat(unapproved.state()).isEqualTo("DRAFT");
        assertThat(unapproved.items()).isEqualTo(items);
        assertThat(unapproved.revision()).isEqualTo(approved.revision()+1);
        assertThat(unapproved.approvedAt()).isNull();
        assertThat(service.fingerprint(WORKSPACE,id)).isNotEqualTo(fingerprint);
        assertThatThrownBy(()->service.approved(WORKSPACE,id,pdfs.current(WORKSPACE,id).sourceSha256())).hasMessageContaining("409");
        assertThatThrownBy(()->service.unapprove(WORKSPACE,id,version,unapproved.revision())).hasMessageContaining("409");
        assertThat(service.approve(WORKSPACE,id,version,unapproved.revision(),"admin").state()).isEqualTo("APPROVED");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM template_checklist_approvals WHERE version_id=?",Integer.class,version)).isEqualTo(2);
        assertThat(pdfs.current(WORKSPACE,id).state()).isEqualTo("READY");
    }
    @Test
    void bulkApprovalIsAtomicAndUsesExactSavedRevisions() throws Exception {
        var ids=new java.util.ArrayList<>(List.of(upload("approve-a",key+"-a"),upload("approve-b",key+"-b")));
        ids.sort(java.util.Comparator.naturalOrder());
        var versions=ids.stream().map(id->pdfs.current(WORKSPACE,id).versionId()).toList();
        for(int i=0;i<2;i++) service.save(WORKSPACE,ids.get(i),versions.get(i),0,List.of(item("Saved",1,"")));
        var first=new TemplateChecklistService.ApprovalRequest(ids.get(0),versions.get(0),1);
        assertThatThrownBy(()->service.approveBatch(WORKSPACE,List.of(first,
            new TemplateChecklistService.ApprovalRequest(ids.get(1),versions.get(1),99)),"admin")).hasMessageContaining("409");
        for(int i=0;i<2;i++) {
            assertThat(service.get(WORKSPACE,ids.get(i)).state()).isEqualTo("DRAFT");
            assertThat(db.queryForObject("SELECT COUNT(*) FROM template_checklist_approvals WHERE version_id=?",Integer.class,versions.get(i))).isZero();
        }
        assertThatThrownBy(()->service.approveBatch(WORKSPACE,List.of(first,first),"admin")).hasMessageContaining("400");
        assertThatThrownBy(()->service.approveBatch(UUID.randomUUID(),List.of(first),"admin")).hasMessageContaining("404");
        var second=new TemplateChecklistService.ApprovalRequest(ids.get(1),versions.get(1),1);
        service.approveBatch(WORKSPACE,List.of(second,first),"admin");
        for(int i=0;i<2;i++) {
            assertThat(service.get(WORKSPACE,ids.get(i)).state()).isEqualTo("APPROVED");
            assertThat(db.queryForObject("SELECT actor FROM template_checklist_approvals WHERE version_id=?",String.class,versions.get(i))).isEqualTo("admin");
        }
        assertThatThrownBy(()->service.approveBatch(WORKSPACE,List.of(second,first),"admin")).hasMessageContaining("409");
    }
    @Test
    void approvalControlsRequirePersistedAdminAndCsrf() throws Exception {
        UUID id=upload("approval-access"), version=pdfs.current(WORKSPACE,id).versionId();
        var draft=service.save(WORKSPACE,id,version,0,List.of(item("Saved",1,"")));
        String bulk="[{\"templateId\":\""+id+"\",\"versionId\":\""+version+"\",\"expectedRevision\":"+draft.revision()+"}]";
        String url="/api/templates/checklists/approve";
        mvc.perform(post(url).with(adviserSession()).with(csrf()).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(bulk)).andExpect(status().isForbidden());
        String subject="approval-admin-"+UUID.randomUUID();
        var login=sessions.create(new GoogleIdentity(subject,"approval@example.invalid","Admin",""));
        var role=assignments.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(),subject,"approval@example.invalid",StaffRole.ADMIN,true,Instant.now(),Instant.now()));
        try {
            var cookie=new Cookie("WILDTRACK_SESSION",login.rawToken());
            mvc.perform(post(url).cookie(cookie).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(bulk)).andExpect(status().isForbidden());
            mvc.perform(post(url).cookie(cookie).with(csrf()).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(bulk)).andExpect(status().isOk());
            String unapprove="/api/templates/"+id+"/checklist/unapprove";
            String body="{\"versionId\":\""+version+"\",\"expectedRevision\":"+(draft.revision()+1)+"}";
            mvc.perform(post(unapprove).with(adviserSession()).with(csrf()).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(body)).andExpect(status().isForbidden());
            mvc.perform(post(unapprove).cookie(cookie).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(body)).andExpect(status().isForbidden());
            mvc.perform(post(unapprove).cookie(cookie).with(csrf()).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(body)).andExpect(status().isOk());
            assertThat(service.get(WORKSPACE,id).items()).hasSize(1);
        } finally { sessions.revoke(login.rawToken()); assignments.deleteById(role.getId()); }
    }

    @Test
    void rejectsInvalidPageConditionAndEmptyApproval() throws Exception {
        UUID id = upload("validation");
        pdfPreparation.prepareNext();
        UUID version = pdfs.current(WORKSPACE, id).versionId();
        assertThatThrownBy(() -> service.save(WORKSPACE, id, version, 0, List.of(item("Bad page", 2, "")))).hasMessageContaining("400");
        var conditional = new TemplateInstructionProtocol.Draft("Conditional", "Instruction", "Quote", "", 1,
            TemplateInstructionProtocol.Applicability.CONDITIONAL, "");
        assertThatThrownBy(() -> service.save(WORKSPACE, id, version, 0, List.of(conditional))).hasMessageContaining("400");
        var empty = service.save(WORKSPACE, id, version, 0, List.of());
        assertThatThrownBy(() -> service.approve(WORKSPACE, id, version, empty.revision(), "admin")).hasMessageContaining("409");
    }

    @Test
    void queuedWorkSurvivesRequestsAndExpiredClaimRequiresExplicitRetry() throws Exception {
        UUID id = upload("queue");
        pdfPreparation.prepareNext();
        UUID version = pdfs.current(WORKSPACE, id).versionId();
        var queued = service.requestPreparation(WORKSPACE, id, version, 0);
        assertThat(queued.state()).isEqualTo("QUEUED");
        assertThat(service.requestPreparation(WORKSPACE, id, version, queued.revision()).state()).isEqualTo("QUEUED");
        var job = store.claim().orElseThrow();
        assertThat(store.claim()).isEmpty();
        db.update("UPDATE template_checklists SET lease_until=CURRENT_TIMESTAMP - INTERVAL '1' MINUTE WHERE version_id=?", version);
        assertThat(service.get(WORKSPACE, id).state()).isEqualTo("PREPARING");
        assertThat(store.claim()).isEmpty();
        assertThat(service.get(WORKSPACE, id).state()).isEqualTo("FAILED");
        assertThat(service.get(WORKSPACE, id).error()).isEqualTo("OUTCOME_UNKNOWN");
        assertThat(store.claim()).isEmpty();
        store.finish(job, List.of(item("Old worker", 1, "")));
        assertThat(service.get(WORKSPACE, id).state()).isEqualTo("FAILED");
        assertThat(service.requestPreparation(WORKSPACE, id, version, queued.revision()).state()).isEqualTo("QUEUED");
    }

    @Test
    void checklistEndpointRequiresPersistedAdmin() throws Exception {
        UUID id = upload("access");
        String url = "/api/templates/" + id + "/checklist";
        mvc.perform(get(url).param("workspaceId", WORKSPACE.toString())).andExpect(status().isUnauthorized());
        mvc.perform(get(url).with(session()).param("workspaceId", WORKSPACE.toString())).andExpect(status().isForbidden());
        mvc.perform(get(url).with(adviserSession()).param("workspaceId", WORKSPACE.toString())).andExpect(status().isForbidden());
        // A synthetic ROLE_ADMIN is insufficient without a matching stored role and session.
        mvc.perform(get(url).with(adminSession()).param("workspaceId", WORKSPACE.toString())).andExpect(status().isForbidden());
        String subject = "checklist-admin-" + UUID.randomUUID();
        var session = sessions.create(new GoogleIdentity(subject, "checklist@example.invalid", "Admin", ""));
        var assignment = assignments.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(), subject,
            "checklist@example.invalid", StaffRole.ADMIN, true, Instant.now(), Instant.now()));
        try {
            mvc.perform(get(url).cookie(new Cookie("WILDTRACK_SESSION", session.rawToken()))
                .param("workspaceId", WORKSPACE.toString())).andExpect(status().isOk());
        } finally {
            sessions.revoke(session.rawToken());
            assignments.deleteById(assignment.getId());
        }
    }

    @Test
    void batchReadsDoNotQueueAndPreparationPreservesExistingChecklists() throws Exception {
        var ids = new java.util.ArrayList<UUID>();
        for (int i=0;i<5;i++) ids.add(upload("batch-"+i,key+"-"+i));
        var versions = ids.stream().map(id -> pdfs.current(WORKSPACE,id).versionId()).toList();
        try {
            var draft = service.save(WORKSPACE,ids.get(2),versions.get(2),0,List.of(item("Retained draft",1,"")));
            var toApprove = service.save(WORKSPACE,ids.get(3),versions.get(3),0,List.of(item("Retained approval",1,"")));
            var approved = service.approve(WORKSPACE,ids.get(3),versions.get(3),toApprove.revision(),"admin");
            db.update("INSERT INTO template_checklists(version_id,revision,state,items_json,error) VALUES (?,1,'FAILED','[]','OUTCOME_UNKNOWN')",versions.get(4));
            assertThat(service.batch(WORKSPACE).stream().filter(row -> ids.contains(row.templateId())).map(TemplateChecklistService.BatchItem::state))
                .containsExactlyInAnyOrder("UNPREPARED","UNPREPARED","DRAFT","APPROVED","FAILED");
            assertThat(service.get(WORKSPACE,ids.get(0)).state()).isEqualTo("UNPREPARED");
            var queued = service.requestBatch(WORKSPACE,List.of(
                new TemplateChecklistService.BatchRequest(ids.get(0),versions.get(0),0),
                new TemplateChecklistService.BatchRequest(ids.get(4),versions.get(4),1)));
            assertThat(queued.stream().filter(row -> row.templateId().equals(ids.get(0)) || row.templateId().equals(ids.get(4))).map(TemplateChecklistService.BatchItem::state))
                .containsOnly("QUEUED");
            assertThat(service.get(WORKSPACE,ids.get(1)).state()).isEqualTo("UNPREPARED");
            assertThat(service.get(WORKSPACE,ids.get(2))).isEqualTo(draft);
            assertThat(service.get(WORKSPACE,ids.get(3))).isEqualTo(approved);
            var first = service.get(WORKSPACE,ids.get(0));
            service.requestBatch(WORKSPACE,List.of(new TemplateChecklistService.BatchRequest(ids.get(0),versions.get(0),first.revision())));
            assertThat(service.get(WORKSPACE,ids.get(0))).isEqualTo(first);
            assertThatThrownBy(() -> service.requestBatch(WORKSPACE,List.of(new TemplateChecklistService.BatchRequest(ids.get(3),versions.get(3),approved.revision()))))
                .hasMessageContaining("409");
            assertThat(service.get(WORKSPACE,ids.get(3))).isEqualTo(approved);
        } finally { versions.forEach(version -> db.update("DELETE FROM template_checklists WHERE version_id=?",version)); }
    }

    @Test
    void batchIsAtomicOnStaleRevisionsAndRejectsInvalidSelections() throws Exception {
        var ids = new java.util.ArrayList<>(List.of(upload("atomic-a",key+"-a"),upload("atomic-b",key+"-b")));
        ids.sort(java.util.Comparator.naturalOrder());
        var first = new TemplateChecklistService.BatchRequest(ids.get(0),pdfs.current(WORKSPACE,ids.get(0)).versionId(),0);
        var secondVersion = pdfs.current(WORKSPACE,ids.get(1)).versionId();
        var stale = new TemplateChecklistService.BatchRequest(ids.get(1),secondVersion,12);
        assertThatThrownBy(() -> service.requestBatch(WORKSPACE,List.of(first,stale))).hasMessageContaining("409");
        assertThat(service.get(WORKSPACE,ids.get(0)).state()).isEqualTo("UNPREPARED");
        assertThat(service.get(WORKSPACE,ids.get(1)).state()).isEqualTo("UNPREPARED");
        assertThatThrownBy(() -> service.requestBatch(WORKSPACE,List.of(first,new TemplateChecklistService.BatchRequest(ids.get(1),UUID.randomUUID(),0))))
            .hasMessageContaining("409");
        assertThat(service.get(WORKSPACE,ids.get(0)).state()).isEqualTo("UNPREPARED");
        for (var selection:List.of(List.<TemplateChecklistService.BatchRequest>of(),List.of(first,first),
                List.of(new TemplateChecklistService.BatchRequest(null,first.versionId(),0)),
                List.of(new TemplateChecklistService.BatchRequest(first.templateId(),null,0)),
                List.of(new TemplateChecklistService.BatchRequest(first.templateId(),first.versionId(),-1))))
            assertThatThrownBy(() -> service.requestBatch(WORKSPACE,selection)).hasMessageContaining("400");
        assertThatThrownBy(() -> service.requestBatch(UUID.randomUUID(),List.of(first))).hasMessageContaining("404");
        assertThat(service.get(WORKSPACE,ids.get(0)).state()).isEqualTo("UNPREPARED");
    }

    @Test
    void batchEndpointRequiresPersistedAdminAndCsrf() throws Exception {
        String url="/api/templates/checklists";
        mvc.perform(get(url).param("workspaceId",WORKSPACE.toString())).andExpect(status().isUnauthorized());
        mvc.perform(get(url).with(session()).param("workspaceId",WORKSPACE.toString())).andExpect(status().isForbidden());
        mvc.perform(get(url).with(adviserSession()).param("workspaceId",WORKSPACE.toString())).andExpect(status().isForbidden());
        mvc.perform(get(url).with(adminSession()).param("workspaceId",WORKSPACE.toString())).andExpect(status().isForbidden());
        String subject="batch-admin-"+UUID.randomUUID();
        var login=sessions.create(new GoogleIdentity(subject,"batch@example.invalid","Admin",""));
        var role=assignments.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(),subject,"batch@example.invalid",StaffRole.ADMIN,true,Instant.now(),Instant.now()));
        try {
            var cookie=new Cookie("WILDTRACK_SESSION",login.rawToken());
            mvc.perform(get(url).cookie(cookie).param("workspaceId",WORKSPACE.toString())).andExpect(status().isOk());
            mvc.perform(post(url+"/prepare").cookie(cookie).param("workspaceId",WORKSPACE.toString())
                .contentType("application/json").content("[]")).andExpect(status().isForbidden());
            mvc.perform(post(url+"/prepare").cookie(cookie).with(csrf()).param("workspaceId",WORKSPACE.toString())
                .contentType("application/json").content("[]")).andExpect(status().isBadRequest());
        } finally { sessions.revoke(login.rawToken()); assignments.deleteById(role.getId()); }
    }

    @Test
    void explicitRerunResetsProviderCacheKeepsItemsUntilSuccessAndRequiresNewApproval() throws Exception {
        UUID id=upload("rerun"), version=pdfs.current(WORKSPACE,id).versionId();
        var old=List.of(item("Saved edit",1,""));
        var source=instructions.claim(version,"test-provider",null).orElseThrow();
        assertThat(instructions.startRequest(source)).isTrue();
        assertThat(instructions.checkpoint(source,1,old,true)).isTrue();
        var draft=service.save(WORKSPACE,id,version,0,old);
        var approved=service.approve(WORKSPACE,id,version,draft.revision(),"admin");
        String oldFingerprint=service.fingerprint(WORKSPACE,id);
        assertThatThrownBy(() -> service.requestPreparation(WORKSPACE,id,version,approved.revision())).hasMessageContaining("409");
        assertThatThrownBy(() -> service.requestRegeneration(WORKSPACE,id,version,approved.revision()-1)).hasMessageContaining("409");
        assertThat(instructions.find(version).orElseThrow().state()).isEqualTo("READY");
        var queued=service.requestRegeneration(WORKSPACE,id,version,approved.revision());
        assertThat(queued.state()).isEqualTo("QUEUED");
        assertThat(queued.items()).isEqualTo(old);
        assertThat(queued.approvedAt()).isNull();
        assertThat(service.fingerprint(WORKSPACE,id)).isNotEqualTo(oldFingerprint);
        assertThatThrownBy(() -> service.approved(WORKSPACE,id,pdfs.current(WORKSPACE,id).sourceSha256())).hasMessageContaining("409");
        assertThatThrownBy(() -> service.requestRegeneration(WORKSPACE,id,version,approved.revision())).hasMessageContaining("409");
        var reset=instructions.find(version).orElseThrow();
        assertThat(reset.completedPage()).isZero();
        assertThat(reset.items()).isEmpty();
        assertThat(reset.requestCount()).isEqualTo(1);
        assertThat(instructions.claim(version,"test-provider",null)).isEmpty();
        assertThat(instructions.checkpoint(source,1,old,true)).isFalse();
        assertThat(instructions.claim(version,"test-provider",store.find(version).orElseThrow().retry())).isPresent();
        UUID claim=UUID.randomUUID();
        db.update("UPDATE template_checklists SET state='PREPARING',claim_token=? WHERE version_id=?",claim,version);
        store.finish(new TemplateChecklistStore.Job(version,claim,WORKSPACE,id,"source",reset.token()),List.of(item("New AI draft",1,"")));
        var replacement=service.get(WORKSPACE,id);
        assertThat(replacement.state()).isEqualTo("DRAFT");
        assertThat(replacement.items()).extracting(TemplateInstructionProtocol.Draft::title).containsExactly("New AI draft");
        assertThat(db.queryForObject("SELECT COUNT(*) FROM template_checklist_approvals WHERE version_id=?",Integer.class,version)).isEqualTo(1);
        assertThat(service.approve(WORKSPACE,id,version,replacement.revision(),"admin").state()).isEqualTo("APPROVED");
    }

    @Test
    void rerunOfManualDraftWorksButAnActiveProviderClaimCannotBeReplaced() throws Exception {
        UUID id=upload("manual-rerun"), version=pdfs.current(WORKSPACE,id).versionId();
        var draft=service.save(WORKSPACE,id,version,0,List.of(item("Manual",1,"")));
        assertThat(service.requestRegeneration(WORKSPACE,id,version,draft.revision()).state()).isEqualTo("QUEUED");
        assertThat(instructions.find(version)).isEmpty();
        long queuedRevision=draft.revision()+1;
        assertThatThrownBy(() -> service.requestRegeneration(WORKSPACE,id,version,queuedRevision)).hasMessageContaining("409");
        db.update("DELETE FROM template_checklists WHERE version_id=?",version);
        draft=service.save(WORKSPACE,id,version,0,List.of(item("Retained",1,"")));
        instructions.claim(version,"test-provider",null).orElseThrow();
        long revision=draft.revision();
        assertThatThrownBy(() -> service.requestRegeneration(WORKSPACE,id,version,revision)).hasMessageContaining("409");
        assertThat(service.get(WORKSPACE,id).state()).isEqualTo("DRAFT");
        assertThat(service.get(WORKSPACE,id).items()).extracting(TemplateInstructionProtocol.Draft::title).containsExactly("Retained");
        db.update("DELETE FROM template_checklists WHERE version_id=?",version);
    }

    @Test
    void rerunEndpointRequiresPersistedAdminCsrfAndCurrentRevision() throws Exception {
        UUID id=upload("rerun-access"), version=pdfs.current(WORKSPACE,id).versionId();
        var draft=service.save(WORKSPACE,id,version,0,List.of(item("Keep",1,"")));
        String url="/api/templates/"+id+"/checklist/rerun";
        String payload="{\"versionId\":\""+version+"\",\"expectedRevision\":"+draft.revision()+"}";
        mvc.perform(post(url).with(adviserSession()).with(csrf()).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(payload)).andExpect(status().isForbidden());
        String subject="rerun-admin-"+UUID.randomUUID();
        var login=sessions.create(new GoogleIdentity(subject,"rerun@example.invalid","Admin",""));
        var role=assignments.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(),subject,"rerun@example.invalid",StaffRole.ADMIN,true,Instant.now(),Instant.now()));
        try {
            var cookie=new Cookie("WILDTRACK_SESSION",login.rawToken());
            mvc.perform(post(url).cookie(cookie).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(payload)).andExpect(status().isForbidden());
            mvc.perform(post(url).cookie(cookie).with(csrf()).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(payload)).andExpect(status().isOk());
            mvc.perform(post(url).cookie(cookie).with(csrf()).param("workspaceId",WORKSPACE.toString()).contentType("application/json").content(payload)).andExpect(status().isConflict());
            db.update("DELETE FROM template_checklists WHERE version_id=?",version);
            service.save(WORKSPACE,id,version,0,List.of(item("Batch rerun",1,"")));
            mvc.perform(post("/api/templates/checklists/prepare").cookie(cookie).with(csrf()).param("workspaceId",WORKSPACE.toString())
                .contentType("application/json").content("[{\"templateId\":\""+id+"\",\"versionId\":\""+version+"\",\"expectedRevision\":1,\"rerun\":true}]"))
                .andExpect(status().isOk());
            assertThat(service.get(WORKSPACE,id).state()).isEqualTo("QUEUED");
        } finally {
            db.update("DELETE FROM template_checklists WHERE version_id=?",version);
            sessions.revoke(login.rawToken()); assignments.deleteById(role.getId());
        }
    }

    @Test
    void aStaleBatchRerunRollsBackEveryChecklistAndProviderCache() throws Exception {
        var ids=new java.util.ArrayList<>(List.of(upload("rerun-atomic-a",key+"-a"),upload("rerun-atomic-b",key+"-b")));
        ids.sort(java.util.Comparator.naturalOrder());
        var versions=ids.stream().map(id->pdfs.current(WORKSPACE,id).versionId()).toList();
        for (int i=0;i<2;i++) {
            var source=instructions.claim(versions.get(i),"test-provider",null).orElseThrow();
            instructions.checkpoint(source,1,List.of(item("Source",1,"")),true);
            service.save(WORKSPACE,ids.get(i),versions.get(i),0,List.of(item("Retained",1,"")));
        }
        assertThatThrownBy(()->service.requestBatch(WORKSPACE,List.of(
            new TemplateChecklistService.BatchRequest(ids.get(0),versions.get(0),1,true),
            new TemplateChecklistService.BatchRequest(ids.get(1),versions.get(1),99,true)))).hasMessageContaining("409");
        for (int i=0;i<2;i++) {
            assertThat(service.get(WORKSPACE,ids.get(i)).state()).isEqualTo("DRAFT");
            assertThat(service.get(WORKSPACE,ids.get(i)).revision()).isEqualTo(1);
            assertThat(instructions.find(versions.get(i)).orElseThrow().state()).isEqualTo("READY");
        }
    }

    private TemplateInstructionProtocol.Draft item(String title, int page, String condition) {
        return new TemplateInstructionProtocol.Draft(title, "Instruction", "Quote", "", page,
            TemplateInstructionProtocol.Applicability.REQUIRED, condition);
    }
    private UUID upload(String value) throws Exception {
        return upload(value, key);
    }
    private UUID upload(String value, String templateKey) throws Exception {
        try (var document = new PDDocument(); var bytes = new ByteArrayOutputStream()) {
            var page = new PDPage();
            document.addPage(page);
            try (var stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                stream.newLineAtOffset(30, 700);
                stream.showText("Describe the users and explain the expected behavior for this official template: " + value);
                stream.endText();
            }
            document.getDocumentInformation().setTitle(value);
            document.save(bytes);
            UUID id = templates.save(WORKSPACE, templateKey, "Template",
                new MockMultipartFile("file", "source.pdf", "application/pdf", bytes.toByteArray())).id();
            for (int attempts = 0; attempts < 20 && !"READY".equals(pdfs.current(WORKSPACE, id).state()); attempts++)
                pdfPreparation.prepareNext();
            assertThat(pdfs.current(WORKSPACE, id).state()).isEqualTo("READY");
            return id;
        }
    }
}
