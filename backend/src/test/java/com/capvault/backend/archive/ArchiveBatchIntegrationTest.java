package com.capvault.backend.archive;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.capvault.backend.response.*;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.student.*;
import com.capvault.backend.workspace.*;
import com.capvault.backend.filecheck.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties="wildtrack.archive.worker-enabled=false")
@ActiveProfiles("test")
class ArchiveBatchIntegrationTest {
    @Autowired ArchiveBatchService service;
    @Autowired ArchiveBatchStore store;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentRecordRepository students;
    @Autowired DeliverableRepository deliverables;
    @Autowired DeliverableFieldRepository fields;
    @Autowired FormResponseRepository responses;
    @Autowired ResponseAcceptanceRepository acceptances;
    @Autowired JdbcTemplate jdbc;
    @MockBean ArchiveService archive;
    @MockBean FileCheckService checks;
    UUID workspace, form;

    @AfterEach void finishJobs() { jdbc.update("UPDATE archive_batches SET state='COMPLETE' WHERE workspace_id=?", workspace); }

    @BeforeEach void seed() {
        // Other test jobs must not be picked by this worker's global queue.
        jdbc.update("UPDATE archive_batches SET state='COMPLETE'");
        String suffix=UUID.randomUUID().toString();
        workspace=workspaces.saveAndFlush(new AcademicWorkspace("Archive batch "+suffix, "IT", suffix, "1", "2026", true)).getId();
        form=deliverables.saveAndFlush(new Deliverable(workspace,"SRS","SRS","srs","Submit",LocalDateTime.now(),true,DeliverableStatus.PUBLISHED)).getId();
        fields.saveAndFlush(new DeliverableField("pdf-"+suffix,form,"pdf","PDF",DeliverableFieldType.DRIVE_PDF,true,0,DocumentCheckPolicy.AUTO,false,true));
        when(checks.check(eq(workspace),any())).thenAnswer(call -> {
            var request=call.getArgument(1, FileCheckRequest.class);
            return new FileCheckResponse(null,request.responseId(),request.fieldId(),request.sourceUrl(),request.sourceResponseUpdatedAt(),
                "COMPLETED",false,"PDF opened.",List.of(),List.of(),List.of(),null,null,
                new FileCheckResponse.DocumentResult(true,false,1,100),null,"system",LocalDateTime.now());
        });
        when(archive.prepare(eq(workspace),anyList(),anyString())).thenAnswer(call -> List.of(new ArchiveService.Preparation(
            ((List<UUID>)call.getArgument(1)).getFirst(),true,1,false,"PDFs checked against the accepted files.")));
    }
    FormResponse response(String label) {
        var student=students.saveAndFlush(new StudentRecord(workspace, UUID.randomUUID().toString(),label,"Team","1","G1","Adviser",null,1));
        var now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        var response=responses.saveAndFlush(new FormResponse(UUID.randomUUID(),workspace,form,UUID.randomUUID().toString(),"student@test.invalid",
            student.getId(),student.getStudentNumber(),label,"Team","{\"pdf\":\"https://drive.google.com/file/d/sample/view\"}",now,now));
        acceptances.saveAndFlush(new ResponseAcceptance(UUID.randomUUID(),response,"admin","admin@test.invalid","ADMIN",now,now));
        return response;
    }
    @Test void preparationSurvivesNewServiceReadsAndDuplicateStartRequestsReuseTheSameJob() throws Exception {
        var a=response("Student A"); var b=response("Student B");
        var prepared=service.prepare(workspace,List.of(a.getId(),b.getId()),"admin");
        assertThat(prepared.state()).isEqualTo("CHECKING");
        assertThat(service.prepare(workspace,List.of(a.getId()),"another-admin").id()).isEqualTo(prepared.id());
        assertThat(service.runOne()).isTrue();
        assertThat(service.latest(workspace).items()).filteredOn(item -> item.stage().equals("READY")).hasSize(1);
        // Saved SQL state is enough to resume; no HTTP request/browser state is needed.
        assertThat(store.latest(workspace).orElseThrow().data().items()).hasSize(2);
        service.runOne();
        var ready=service.latest(workspace);
        assertThat(ready.state()).isEqualTo("READY");
        verify(checks,times(2)).check(eq(workspace),any());
        var started=service.start(workspace,ready.id(),ready.version());
        assertThat(service.start(workspace,ready.id(),ready.version()).id()).isEqualTo(started.id());
        assertThat(service.prepare(workspace,List.of(b.getId()),"admin").id()).isEqualTo(started.id());
        verify(archive,times(2)).prepare(eq(workspace),anyList(),anyString());
        verifyNoMoreInteractions(archive);
    }
    @Test void invalidFileDoesNotStopLaterChecksAndRevokedAcceptanceIsRecheckedBeforeCopying() {
        var a=response("Blocked"); var b=response("Ready");
        when(checks.check(eq(workspace),argThat(request -> request.responseId().equals(a.getId().toString())))).thenThrow(new IllegalArgumentException("Drive link is missing."));
        service.prepare(workspace,List.of(a.getId(),b.getId()),"admin"); service.runOne(); service.runOne();
        var ready=service.latest(workspace);
        assertThat(ready.items().getFirst().stage()).isEqualTo("BLOCKED");
        assertThat(ready.items().getLast().ready()).isTrue();
        var acceptance=acceptances.findByResponseId(b.getId()).orElseThrow(); acceptance.setRevokedAt(Instant.now()); acceptances.saveAndFlush(acceptance);
        service.start(workspace,ready.id(),ready.version()); service.runOne();
        assertThat(service.latest(workspace).state()).isEqualTo("COMPLETE");
        assertThat(service.latest(workspace).items().getLast().message()).contains("Acceptance was revoked");
        verify(archive,never()).archive(any(),anyList(),anyString());
    }
    @Test void queueingAndCopyingContinueWithoutABrowserAndCompleteOnlyAfterPreservation() {
        var response=response("Student"); var id=UUID.randomUUID();
        var copy=mock(ArchiveRecordResponse.class);
        when(copy.id()).thenReturn(id); when(copy.captureState()).thenReturn("QUEUED");
        when(archive.archive(eq(workspace),eq(List.of(response.getId())),anyString())).thenReturn(List.of(copy));
        when(archive.get(workspace,id)).thenReturn(copy);
        service.prepare(workspace,List.of(response.getId()),"admin"); service.runOne();
        var ready=service.latest(workspace); service.start(workspace,ready.id(),ready.version()); service.runOne();
        assertThat(service.latest(workspace).state()).isEqualTo("ARCHIVING");
        assertThat(service.latest(workspace).items().getFirst().stage()).isEqualTo("COPYING");
        service.runOne(); verify(archive,times(1)).archive(eq(workspace),anyList(),anyString());
        when(copy.captureState()).thenReturn("COMPLETE"); service.runOne();
        assertThat(service.latest(workspace).state()).isEqualTo("COMPLETE");
        assertThat(service.latest(workspace).items().getFirst().message()).isEqualTo("PDFs preserved.");
    }
    @Test void creationIsSerializedAndAStaleConfirmationCannotStartAnOlderSummary() throws Exception {
        var response=response("Student"); var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(() -> {start.await();return service.prepare(workspace,List.of(response.getId()),"a");});
            var b=pool.submit(() -> {start.await();return service.prepare(workspace,List.of(response.getId()),"b");}); start.countDown();
            assertThat(a.get(10,TimeUnit.SECONDS).id()).isEqualTo(b.get(10,TimeUnit.SECONDS).id());
        }
        service.runOne(); var old=service.latest(workspace);
        service.prepare(workspace,List.of(response.getId()),"admin");
        assertThatThrownBy(() -> service.start(workspace,old.id(),old.version())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
    @Test void anExpiredWorkerLeaseCanBeResumedFromSavedProgress() {
        var response=response("Student"); var job=service.prepare(workspace,List.of(response.getId()),"admin");
        assertThat(store.claim()).isPresent();
        assertThat(service.runOne()).isFalse();
        jdbc.update("UPDATE archive_batches SET lease_until = ? WHERE id = ?",java.sql.Timestamp.from(Instant.now().minusSeconds(1)),job.id());
        assertThat(service.runOne()).isTrue();
        assertThat(service.latest(workspace).state()).isEqualTo("READY");
    }
}
