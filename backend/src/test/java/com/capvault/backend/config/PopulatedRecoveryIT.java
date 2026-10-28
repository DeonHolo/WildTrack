package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;
import com.capvault.backend.CapVaultBackendApplication;
import com.capvault.backend.archive.ArchiveService;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.response.*;
import com.capvault.backend.student.*;
import com.capvault.backend.template.*;
import com.capvault.backend.workspace.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.security.MessageDigest;
import java.sql.DriverManager;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.ApplicationContextFactory;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockServletContext;
import org.springframework.web.context.support.GenericWebApplicationContext;

/** Isolated file-backed recovery. No production credentials or provider calls. */
class PopulatedRecoveryIT {
    @TempDir Path directory;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    @Test
    void populatedServiceRestartAndSeparateRestorePreserveIdentitiesAndBytes() throws Exception {
        String sourceUrl = url("source"), restoredUrl = url("restored");
        Path backup = directory.resolve("backup.sql");
        UUID workspaceId, responseId, templateId;
        Map<String, Object> before;
        byte[] pdf;
        try (var document=new org.apache.pdfbox.pdmodel.PDDocument(); var bytes=new java.io.ByteArrayOutputStream()) {
            document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            document.save(bytes); pdf=bytes.toByteArray();
        }
        try (var app = start(sourceUrl)) {
            var ws = app.getBean(AcademicWorkspaceRepository.class).save(new AcademicWorkspace("Recovery isolated", "IT", "IT411", "Recovery", "2098-99", true));
            workspaceId = ws.getId();
            app.getBean(StudentRecordRepository.class).save(new StudentRecord(workspaceId, "REC-001", "Recovery Student", "RECOVERY", "1", "IT01", "", null, 1));
            var form = app.getBean(DeliverableRepository.class).save(new Deliverable(workspaceId, "RECOVERY", "Recovery deliverable", "recovery-isolated", "Submit link.", LocalDateTime.of(2099,1,1,23,59), false, DeliverableStatus.PUBLISHED));
            app.getBean(StudentAssociationService.class).confirmAssociation(workspaceId, "recovery-subject", "recovery@example.test", "REC-001");
            var responses = app.getBean(FormResponseService.class);
            var first = responses.submit(command(workspaceId, form.getId(), "original", null));
            var second = responses.submit(command(workspaceId, form.getId(), "revised", first.clientRevision()));
            responseId = second.response().getId();
            app.getBean(ReviewFeedbackService.class).accept(responseId, "recovery-admin", "admin@example.test", "ADMIN");
            var archives = app.getBean(ArchiveService.class);
            // Keep historical metadata-only archives recoverable without claiming preserved PDF bytes.
            var saved=app.getBean(FormResponseRepository.class).findById(responseId).orElseThrow();
            app.getBean(com.capvault.backend.archive.ArchiveRecordRepository.class).saveAndFlush(
                new com.capvault.backend.archive.ArchiveRecord(UUID.randomUUID(),workspaceId,responseId,saved.getUpdatedAt(),
                    ws.getName(),form.getTitle(),saved.getTeamCode(),saved.getStudentName(),saved.getStudentNumber(),
                    null,null,null,1,"https://example.test/revised","[]",sha(saved.getValuesJson().getBytes(java.nio.charset.StandardCharsets.UTF_8)),java.time.Instant.now()));
            var archived = archives.list(workspaceId);
            responses.submit(command(workspaceId, form.getId(), "after-archive", second.clientRevision()));
            assertThat(archives.list(workspaceId)).isEqualTo(archived);
            assertThat(archived.getFirst().sourceLink()).isEqualTo("https://example.test/revised");
            templateId = app.getBean(DocumentTemplateRepository.class).save(new DocumentTemplate(workspaceId, "RECOVERY", "Recovery PDF", "recovery.pdf", "application/pdf", pdf, null, sha(pdf), "Recovery template for byte preservation.")).getId();
            before = snapshot(app, workspaceId, responseId, templateId);
            assertThat((List<?>) before.get("versions")).hasSize(2);
            assertThat((List<?>) before.get("archives")).hasSize(1);
            app.getBean(JdbcTemplate.class).execute("SCRIPT TO '" + sqlPath(backup) + "'");
        }
        assertThat(Files.size(backup)).isPositive();
        try (var restarted = start(sourceUrl)) {
            assertThat(snapshot(restarted, workspaceId, responseId, templateId)).isEqualTo(before);
            assertThat(restarted.getBean(DocumentTemplateService.class).readFile(workspaceId, templateId).bytes()).isEqualTo(pdf);
        }
        try (var connection = DriverManager.getConnection(restoredUrl, "sa", "")) {
            connection.createStatement().execute("RUNSCRIPT FROM '" + sqlPath(backup) + "'");
        }
        try (var restored = start(restoredUrl)) {
            assertThat(snapshot(restored, workspaceId, responseId, templateId)).isEqualTo(before);
            assertThat(restored.getBean(DocumentTemplateService.class).readFile(workspaceId, templateId).bytes()).isEqualTo(pdf);
            restored.getBean(JdbcTemplate.class).update("UPDATE academic_workspaces SET name = ? WHERE id = ?", "Restored only", workspaceId);
        }
        try (var original = start(sourceUrl)) {
            assertThat(original.getBean(AcademicWorkspaceRepository.class).findById(workspaceId).orElseThrow().getName()).isEqualTo("Recovery isolated");
        }
        Path evidence = Path.of("target", "std-populated-recovery"); Files.createDirectories(evidence);
        Files.copy(backup, evidence.resolve("backup.sql"), StandardCopyOption.REPLACE_EXISTING);
        json.writerWithDefaultPrettyPrinter().writeValue(evidence.resolve("comparison.json").toFile(), Map.of("result", "PASS", "database", "H2 file-backed PostgreSQL compatibility mode", "scope", "isolated service restart and SQL backup/separate restore; not hosted PostgreSQL recovery", "backupSha256", sha(Files.readAllBytes(backup)), "sourcePdfSha256", sha(pdf), "snapshot", before, "restartMatches", true, "restoredMatches", true, "archiveUnchangedAfterEdit", true, "restoreIsIndependent", true));
    }
    private FormResponseService.SubmitCommand command(UUID ws, UUID form, String link, Long revision) {
        return new FormResponseService.SubmitCommand(ws, form, "recovery-subject", "recovery@example.test", Map.of("driveLink", "https://example.test/" + link), revision);
    }
    private Map<String,Object> snapshot(ConfigurableApplicationContext app, UUID ws, UUID responseId, UUID templateId) throws Exception {
        var r = app.getBean(FormResponseRepository.class).findById(responseId).orElseThrow();
        var versions = app.getBean(FormResponseVersionRepository.class).findAllByResponseIdOrderByRevisionAsc(responseId).stream().map(v -> Map.of("id", v.getId().toString(), "revision", v.getRevision(), "values", v.getValuesJson(), "createdAt", v.getCreatedAt().toString())).toList();
        var template = app.getBean(DocumentTemplateService.class).readFile(ws, templateId);
        assertThat(app.getBean(FormResponseService.class).ownedResponse(ws, r.getDeliverableId(), "recovery-subject")).isPresent();
        return Map.of("responseId", responseId.toString(), "workspaceId", ws.toString(), "deliverableId", r.getDeliverableId().toString(), "revision", r.getRevision(), "values", r.getValuesJson(), "versions", versions, "template", Map.of("id", templateId.toString(), "filename", template.filename(), "bytesSha256", sha(template.bytes()), "sizeBytes", template.bytes().length), "archives", json.convertValue(app.getBean(ArchiveService.class).list(ws), List.class));
    }
    private ConfigurableApplicationContext start(String url) {
        var app = new SpringApplication(CapVaultBackendApplication.class);
        app.setApplicationContextFactory(ApplicationContextFactory.ofContextClass(GenericWebApplicationContext.class));
        app.addInitializers(c -> ((GenericWebApplicationContext)c).setServletContext(new MockServletContext()));
        return app.run("--spring.profiles.active=test", "--spring.datasource.url=" + url, "--spring.datasource.username=sa", "--spring.datasource.password=", "--spring.datasource.driver-class-name=org.h2.Driver", "--spring.main.banner-mode=off", "--logging.level.root=WARN");
    }
    private String url(String name) { return "jdbc:h2:file:" + directory.resolve(name).toAbsolutePath().toString().replace('\\','/') + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH"; }
    private static String sqlPath(Path p) { return p.toAbsolutePath().toString().replace('\\','/').replace("'", "''"); }
    private static String sha(byte[] bytes) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
}
