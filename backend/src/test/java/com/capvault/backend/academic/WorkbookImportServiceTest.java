package com.capvault.backend.academic;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.io.*;
import java.util.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.workspace.*;
import com.capvault.backend.workbook.WorkbookCodec;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WorkbookImportServiceTest {
    @Autowired WorkbookImportService imports;
    @Autowired WorkbookCodec codec;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired StudentRecordRepository students;
    @SpyBean AcademicDataService academic;
    @Autowired JdbcTemplate db;
    @Autowired com.capvault.backend.student.StudentAssociationService associations;
    @Autowired org.springframework.test.web.servlet.MockMvc mvc;
    @Autowired com.capvault.backend.auth.WildTrackSessionService sessions;
    @Autowired com.capvault.backend.staff.StaffRoleAssignmentRepository staff;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper mapper;
    @Autowired com.capvault.backend.response.FormResponseRepository responses;
    @Autowired com.capvault.backend.response.ResponseAcceptanceRepository acceptances;
    @Autowired com.capvault.backend.archive.ArchiveRecordRepository archives;

    private UUID workspace() {
        return workspaces.saveAndFlush(new AcademicWorkspace("Workbook", "IT", UUID.randomUUID().toString(), "Test", "2099", true)).getId();
    }
    private byte[] workbook(String name, String team, boolean projects, boolean deliverables) throws Exception {
        try (var wb=new XSSFWorkbook(new ByteArrayInputStream(codec.template())); var out=new ByteArrayOutputStream()) {
            var row=wb.getSheet("Students").createRow(1);
            row.createCell(0).setCellValue("26-100"); row.createCell(1).setCellValue(name); row.createCell(2).setCellValue(team);
            if(projects) {var p=wb.getSheet("Teams and Projects").createRow(1); p.createCell(0).setCellValue(team); p.createCell(1).setCellValue("Project");}
            else wb.removeSheetAt(wb.getSheetIndex("Teams and Projects"));
            if(deliverables) {var d=wb.getSheet("Deliverables").createRow(1); d.createCell(0).setCellValue("SRS"); d.createCell(1).setCellValue("SRS form"); d.createCell(2).setCellValue("2027-01-01T12:00");}
            else wb.removeSheetAt(wb.getSheetIndex("Deliverables"));
            wb.write(out); return out.toByteArray();
        }
    }
    @Test
    void importIsIdempotentAndPreservesExistingLocalValueOnConflict() throws Exception {
        UUID ws=workspace(); byte[] original=workbook("Original","T1",true,true);
        var first=imports.preview(ws,"admin","first.xlsx",original);
        assertThat(first.errors()).isEmpty(); assertThat(first.addedRows()).isEqualTo(3);
        var result=imports.apply(ws,"admin",first.previewId(),Map.of());
        assertThat(imports.apply(ws,"admin",first.previewId(),Map.of())).isEqualTo(result);
        var again=imports.preview(ws,"admin","same.xlsx",original);
        assertThat(again.errors()).isEmpty(); assertThat(again.unchangedRows()).isEqualTo(3);
        assertThat(again.changes()).isEmpty();
        imports.apply(ws,"admin",again.previewId(),Map.of());
        var student=academic.snapshot(ws).students().get(0);
        academic.saveStudents(ws,new AcademicDataService.StudentBatch(List.of(new AcademicDataService.StudentEdit(student.id(),student.studentNumber(),"Local",student.teamCode(),null,null,null,null,student.updatedAt()))));
        var changed=imports.preview(ws,"admin","changed.xlsx",workbook("Source","T1",false,false));
        var conflict=changed.changes().get(0).fields().stream().filter(f->f.name().equals("studentName")).findFirst().orElseThrow();
        assertThat(conflict.conflict()).isTrue();
        assertThatThrownBy(()->imports.apply(ws,"admin",changed.previewId(),Map.of())).isInstanceOf(ResponseStatusException.class);
        var kept=imports.apply(ws,"admin",changed.previewId(),Map.of(conflict.key(),"LOCAL"));
        assertThat(kept.changedRows()).isZero(); assertThat(kept.unchangedRows()).isEqualTo(1);
        assertThat(academic.snapshot(ws).students().get(0).studentName()).isEqualTo("Local");
        assertThat(academic.snapshot(ws).projects()).hasSize(1);
        assertThat(academic.snapshot(ws).deliverables()).hasSize(1);
    }
    @Test
    void stalePreviewAndOtherActorCannotApply() throws Exception {
        UUID ws=workspace();
        var first=imports.preview(ws,"admin","first.xlsx",workbook("Original","T1",false,false));
        imports.apply(ws,"admin",first.previewId(),Map.of());
        var stale=imports.preview(ws,"admin","second.xlsx",workbook("Changed","T1",false,false));
        var s=academic.snapshot(ws).students().get(0);
        academic.saveStudents(ws,new AcademicDataService.StudentBatch(List.of(new AcademicDataService.StudentEdit(s.id(),s.studentNumber(),"Another",s.teamCode(),null,null,null,null,s.updatedAt()))));
        assertThatThrownBy(()->imports.apply(ws,"admin",stale.previewId(),Map.of())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->imports.apply(ws,"different",first.previewId(),Map.of())).isInstanceOf(ResponseStatusException.class);
        assertThat(academic.snapshot(ws).students().get(0).studentName()).isEqualTo("Another");
    }
    @Test
    void aPartialWorkbookKeepsOmittedRowsBlankOptionalsAndFormConfiguration() throws Exception {
        UUID ws=workspace(); byte[] initial=workbook("Original","T1",true,true);
        try(var wb=new XSSFWorkbook(new ByteArrayInputStream(initial));var out=new ByteArrayOutputStream()) {
            wb.getSheet("Students").getRow(1).createCell(6).setCellValue("student@example.invalid");
            var extra=wb.getSheet("Students").createRow(2);
            extra.createCell(0).setCellValue("26-200");extra.createCell(1).setCellValue("Other Student");extra.createCell(2).setCellValue("T1");
            wb.write(out);initial=out.toByteArray();
        }
        var first=imports.preview(ws,"admin","initial.xlsx",initial);
        assertThat(first.errors()).isEmpty();imports.apply(ws,"admin",first.previewId(),Map.of());
        var before=academic.snapshot(ws);
        var update=imports.preview(ws,"admin","students-only.xlsx",workbook("Updated","T1",false,false));
        assertThat(update.errors()).isEmpty();imports.apply(ws,"admin",update.previewId(),Map.of());
        var after=academic.snapshot(ws);
        assertThat(after.students()).extracting(s->s.id()).containsExactlyInAnyOrderElementsOf(before.students().stream().map(s->s.id()).toList());
        assertThat(after.students().stream().filter(s->s.studentNumber().equals("26-100")).findFirst().orElseThrow().institutionalEmail()).isEqualTo("student@example.invalid");
        assertThat(after.students().stream().filter(s->s.studentNumber().equals("26-200")).findFirst().orElseThrow().studentName()).isEqualTo("Other Student");
        assertThat(after.projects()).isEqualTo(before.projects());assertThat(after.deliverables()).isEqualTo(before.deliverables());
        byte[] forms;
        try(var wb=new XSSFWorkbook(new ByteArrayInputStream(workbook("Ignored","T1",false,true)));var out=new ByteArrayOutputStream()) {
            wb.removeSheetAt(wb.getSheetIndex("Students"));
            wb.getSheet("Deliverables").getRow(1).getCell(1).setCellValue("Updated SRS");
            wb.getSheet("Deliverables").getRow(1).getCell(2).setBlank();
            wb.write(out);forms=out.toByteArray();
        }
        var formPreview=imports.preview(ws,"admin","forms-only.xlsx",forms);
        assertThat(formPreview.errors()).isEmpty();imports.apply(ws,"admin",formPreview.previewId(),Map.of());
        var old=before.deliverables().get(0);var saved=academic.snapshot(ws).deliverables().get(0);
        assertThat(saved.id()).isEqualTo(old.id());assertThat(saved.title()).isEqualTo("Updated SRS");
        assertThat(saved.dueAt()).isEqualTo(old.dueAt());assertThat(saved.status()).isEqualTo(old.status());
        assertThat(saved.fields()).isEqualTo(old.fields());assertThat(saved.slug()).isEqualTo(old.slug());assertThat(saved.instructions()).isEqualTo(old.instructions());
    }
    @Test
    void aBoundStudentCannotBeMovedAndAcademicUpdatesKeepTheAccountBinding() throws Exception {
        UUID ws=workspace();String number="WB-"+UUID.randomUUID();byte[] initial;
        try(var wb=new XSSFWorkbook(new ByteArrayInputStream(workbook("Original","T1",false,false)));var out=new ByteArrayOutputStream()) {
            wb.getSheet("Students").getRow(1).getCell(0).setCellValue(number);wb.write(out);initial=out.toByteArray();
        }
        var first=imports.preview(ws,"admin","initial.xlsx",initial);imports.apply(ws,"admin",first.previewId(),Map.of());
        var claim=associations.associationForSuccessfulSave(ws,"subject-"+number,"student@example.invalid",number,false);
        byte[] moved;
        try(var wb=new XSSFWorkbook(new ByteArrayInputStream(initial));var out=new ByteArrayOutputStream()) {
            wb.getSheet("Students").getRow(1).getCell(2).setCellValue("T2");wb.write(out);moved=out.toByteArray();
        }
        var preview=imports.preview(ws,"admin","moved.xlsx",moved);
        assertThat(preview.errors()).extracting(i->i.message()).anyMatch(message->message.contains("cannot be moved"));
        assertThatThrownBy(()->imports.apply(ws,"admin",preview.previewId(),Map.of())).isInstanceOf(ResponseStatusException.class);
        byte[] renamed;
        try(var wb=new XSSFWorkbook(new ByteArrayInputStream(initial));var out=new ByteArrayOutputStream()) {
            wb.getSheet("Students").getRow(1).getCell(1).setCellValue("Renamed Student");wb.write(out);renamed=out.toByteArray();
        }
        var update=imports.preview(ws,"admin","renamed.xlsx",renamed);
        assertThat(update.errors()).isEmpty();imports.apply(ws,"admin",update.previewId(),Map.of());
        var retained=associations.activeAssociation(ws,"subject-"+number).orElseThrow();
        assertThat(retained.studentRecordId()).isEqualTo(claim.studentRecordId());
        assertThat(retained.googleEmail()).isEqualTo(claim.googleEmail());assertThat(retained.studentName()).isEqualTo("Renamed Student");
        assertThat(db.queryForObject("SELECT google_subject FROM canonical_student_account_bindings WHERE student_number_key=?",String.class,number.toLowerCase(java.util.Locale.ROOT))).isEqualTo("subject-"+number);
        assertThat(academic.snapshot(ws).students().get(0).teamCode()).isEqualTo("T1");
    }
    @Test
    void aFailedApplyRollsBackAcademicRowsBaselinesAndItsReceipt() throws Exception {
        UUID ws=workspace();var preview=imports.preview(ws,"admin","class.xlsx",workbook("Student","T1",true,false));
        doThrow(new IllegalStateException("Simulated import failure")).when(academic).saveProjects(eq(ws),any(AcademicDataService.ProjectBatch.class));
        try {
            assertThatThrownBy(()->imports.apply(ws,"admin",preview.previewId(),Map.of())).hasMessageContaining("Simulated import failure");
        } finally {reset(academic);}
        assertThat(academic.snapshot(ws).students()).isEmpty();assertThat(academic.snapshot(ws).projects()).isEmpty();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM academic_workbook_values WHERE workspace_id=?",Integer.class,ws)).isZero();
        assertThat(db.queryForObject("SELECT applied_at FROM academic_workbook_imports WHERE id=?",java.sql.Timestamp.class,preview.previewId())).isNull();
        assertThat(imports.apply(ws,"admin",preview.previewId(),Map.of()).addedRows()).isEqualTo(2);
    }
    @Test
    void concurrentRetriesReturnOneSavedResult() throws Exception {
        UUID ws=workspace();var preview=imports.preview(ws,"admin","class.xlsx",workbook("Student","T1",false,false));
        var start=new java.util.concurrent.CountDownLatch(1);
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->{start.await();return imports.apply(ws,"admin",preview.previewId(),Map.of());});
            var b=pool.submit(()->{start.await();return imports.apply(ws,"admin",preview.previewId(),Map.of());});
            start.countDown();assertThat(a.get(20,java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(b.get(20,java.util.concurrent.TimeUnit.SECONDS));
        }
        assertThat(academic.snapshot(ws).students()).hasSize(1);
    }
    @Test
    void reimportPreservesSubmittedPdfReviewsAcceptanceAndArchiveSnapshots() throws Exception {
        UUID ws=workspace();var initial=imports.preview(ws,"admin","initial.xlsx",workbook("Original","T1",true,true));
        imports.apply(ws,"admin",initial.previewId(),Map.of());
        var snapshot=academic.snapshot(ws);var student=snapshot.students().get(0);var form=snapshot.deliverables().get(0);
        var now=java.time.Instant.parse("2026-10-28T00:00:00Z");
        String pdf="https://drive.google.com/file/d/workbook-preserved-pdf/view";
        var response=responses.saveAndFlush(new com.capvault.backend.response.FormResponse(UUID.randomUUID(),ws,form.id(),
            "saved-subject","saved@example.invalid",student.id(),student.studentNumber(),student.studentName(),student.teamCode(),
            mapper.writeValueAsString(Map.of("documentPdf",pdf)),now,now));
        acceptances.saveAndFlush(new com.capvault.backend.response.ResponseAcceptance(UUID.randomUUID(),response,
            "admin","admin@example.invalid","ADMIN",now,now));
        archives.saveAndFlush(new com.capvault.backend.archive.ArchiveRecord(UUID.randomUUID(),ws,response.getId(),now,
            "Workbook",form.title(),student.teamCode(),student.studentName(),student.studentNumber(),"Project",null,null,1,pdf,
            "{\"sourceUrl\":\""+pdf+"\"}","a".repeat(64),now));
        String cache=UUID.randomUUID().toString().replace("-","");
        db.update("INSERT INTO ai_review_jobs(cache_key,workspace_id,deliverable_id,team_code,document_sha256,context_sha256,state,claim_token,started_at,completed_at,report_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            cache,ws,form.id(),"T1","b".repeat(64),"c".repeat(64),"COMPLETED",UUID.randomUUID(),java.sql.Timestamp.from(now),java.sql.Timestamp.from(now),"{\"outcome\":\"NO_ACTIONABLE_ISSUES\"}");
        db.update("INSERT INTO ai_review_response_links(response_id,source_revision,cache_key) VALUES(?,?,?)",response.getId(),response.getRevision(),cache);
        Map<String,List<Map<String,Object>>> saved=new LinkedHashMap<>();
        for(String table:List.of("form_responses","response_acceptances","archive_records","ai_review_jobs","ai_review_response_links")) {
            String where=table.equals("ai_review_jobs")?"cache_key":table.equals("form_responses")?"id":"response_id";
            Object key=table.equals("ai_review_jobs")?cache:response.getId();
            saved.put(table,db.queryForList("SELECT * FROM "+table+" WHERE "+where+"=?",key));
        }
        var update=imports.preview(ws,"admin","updated.xlsx",workbook("Updated Name","T1",true,true));
        assertThat(update.errors()).isEmpty();imports.apply(ws,"admin",update.previewId(),Map.of());
        assertThat(academic.snapshot(ws).students().get(0).studentName()).isEqualTo("Updated Name");
        for(var entry:saved.entrySet()) {
            String where=entry.getKey().equals("ai_review_jobs")?"cache_key":entry.getKey().equals("form_responses")?"id":"response_id";
            Object key=entry.getKey().equals("ai_review_jobs")?cache:response.getId();
            assertThat(db.queryForList("SELECT * FROM "+entry.getKey()+" WHERE "+where+"=?",key)).isEqualTo(entry.getValue());
        }
    }
    @Test
    void actualDownloadPreviewAndApplyRequireAnAdminAndCsrf() throws Exception {
        UUID ws=workspace();String subject="workbook-admin-"+UUID.randomUUID();
        var login=sessions.create(new com.capvault.backend.auth.GoogleIdentity(subject,"workbook-admin@example.invalid","Admin",""));
        var assignment=staff.saveAndFlush(new com.capvault.backend.staff.StaffRoleAssignment(UUID.randomUUID(),subject,"workbook-admin@example.invalid",com.capvault.backend.staff.StaffRole.ADMIN,true,java.time.Instant.now(),java.time.Instant.now()));
        var cookie=new jakarta.servlet.http.Cookie("WILDTRACK_SESSION",login.rawToken());
        try {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/workbook/template").param("workspaceId",ws.toString()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isUnauthorized());
            var response=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/workbook/template").cookie(cookie).param("workspaceId",ws.toString()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn().getResponse();
            assertThat(response.getContentType()).contains("spreadsheetml.sheet");
            assertThat(response.getHeader("Content-Disposition")).contains("attachment");
            byte[] template=response.getContentAsByteArray();assertThat(codec.parse(template).rows()).isEmpty();
            byte[] filled;
            try(var wb=new XSSFWorkbook(new ByteArrayInputStream(template));var out=new ByteArrayOutputStream()) {
                var r=wb.getSheet("Students").createRow(1);
                r.createCell(0).setCellValue("WB-HTTP-100");r.createCell(1).setCellValue("Alex Rivera");r.createCell(2).setCellValue("DEMO-01");
                wb.write(out);filled=out.toByteArray();
            }
            String fixture=System.getProperty("wildtrack.workbook.fixtureDir");
            if(fixture!=null) {
                var path=java.nio.file.Path.of(fixture);java.nio.file.Files.createDirectories(path);
                java.nio.file.Files.write(path.resolve("WildTrack_Workspace_Template.xlsx"),template);
                java.nio.file.Files.write(path.resolve("Students_Only_Demo.xlsx"),filled);
            }
            var file=new org.springframework.mock.web.MockMultipartFile("file","students.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",filled);
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/workbook/preview").file(file).cookie(cookie).param("workspaceId",ws.toString()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
            var checked=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart("/api/workbook/preview").file(file).cookie(cookie)
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf()).param("workspaceId",ws.toString()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk()).andReturn().getResponse();
            var preview=mapper.readTree(checked.getContentAsString());assertThat(preview.get("errors").size()).isZero();
            assertThat(academic.snapshot(ws).students()).isEmpty();
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/workbook/apply").cookie(cookie)
                .with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf()).param("workspaceId",ws.toString())
                .contentType("application/json").content("{\"previewId\":\""+preview.get("previewId").asText()+"\",\"resolutions\":{}}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
            assertThat(academic.snapshot(ws).students()).hasSize(1);
        } finally {sessions.revoke(login.rawToken());staff.deleteById(assignment.getId());}
    }
}
