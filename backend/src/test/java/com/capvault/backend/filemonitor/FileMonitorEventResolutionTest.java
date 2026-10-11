package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.drive.*;
import com.capvault.backend.filecheck.*;
import com.capvault.backend.response.*;
import com.capvault.backend.staff.*;
import com.capvault.backend.student.StudentAssociationSecurity;
import com.capvault.backend.template.DocumentTemplateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.util.ReflectionTestUtils;

/** Real SQL/history reads; no scheduled poll, Drive call or acknowledgment write is needed to resolve an alert. */
class FileMonitorEventResolutionTest {
    private final UUID workspace = UUID.randomUUID(), deliverableId = UUID.randomUUID();
    private final String fieldId = "pdf-field", fileId = "current-file";
    private final String url = "https://drive.google.com/file/d/current-file/view?resourcekey=key-a";
    private final Instant alertAt = Instant.parse("2026-10-11T00:00:00Z");
    private final FormResponseRepository responses = mock(FormResponseRepository.class);
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
    private final StudentAssociationSecurity security = mock(StudentAssociationSecurity.class);
    private final StaffManagementService staff = mock(StaffManagementService.class);
    private final HttpServletRequest http = mock(HttpServletRequest.class);
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final List<FormResponse> current = new ArrayList<>();
    private JdbcTemplate db;
    private FormResponse first;
    private DeliverableField field;

    @BeforeEach void setup() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:resolution_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        db = new JdbcTemplate(ds);
        db.execute("CREATE TABLE academic_workspaces(id UUID PRIMARY KEY, file_monitor_selection_configured BOOLEAN)");
        db.update("INSERT INTO academic_workspaces VALUES (?,false)", workspace);
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V27__deadline_aware_drive_monitor.sql")).execute(ds);
        db.execute("CREATE TABLE academic_file_check_reports(workspace_id UUID, external_response_id VARCHAR(240), field_id VARCHAR(80), source_url VARCHAR(2048), report_json TEXT, checked_at TIMESTAMP)");
        field = new DeliverableField(fieldId, deliverableId, "pdf", "Submitted PDF", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.MANUAL, false, true);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId)).thenAnswer(inv -> List.of(field));
        when(security.requireSession(http)).thenReturn(new StoredWildTrackSession("hash", "admin", "admin@example.invalid", alertAt, alertAt.plusSeconds(60)));
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADMIN));
        when(responses.findAllByWorkspaceId(workspace)).thenAnswer(inv -> List.copyOf(current));
        first = response(url, "team-a");
    }

    private FormResponse response(String source, String team) {
        var result = new FormResponse(UUID.randomUUID(), workspace, deliverableId, "student-" + team, "student@example.invalid",
            UUID.randomUUID(), "test-student", "Test Student", team, "{\"pdf\":\"" + source + "\"}", alertAt, alertAt);
        current.add(result);
        return result;
    }
    private FileMonitorEventController controller(ZoneId zone) {
        return new FileMonitorEventController(db, responses, fields, security, staff, json, zone);
    }
    private List<FileMonitorEventController.Event> events() { return controller(ZoneOffset.UTC).events(workspace, http); }
    private UUID event(String kind, Instant when) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO monitored_drive_events(id,workspace_id,file_id,kind,detail,observed_at) VALUES(?,?,?,?,?,?)",
            id, workspace, fileId, kind, "Test observation", Timestamp.from(when));
        return id;
    }
    private ObjectNode opened(String source) {
        var report = json.createObjectNode().put("sourceUrl", source).put("status", "COMPLETED");
        report.putObject("metadata").put("fileId", fileId).put("mimeType", "application/pdf").put("canDownload", true);
        report.putObject("document").put("readable", true).put("encrypted", false);
        report.putArray("flags");
        return report;
    }
    private ObjectNode blocked(String flag) {
        var report = json.createObjectNode().put("sourceUrl", url).put("status", "BLOCKED");
        report.putArray("flags").add(flag);
        return report;
    }
    private void check(FormResponse response, String targetField, String source, ObjectNode report, Instant when) {
        save(workspace, response, targetField, source, report.toString(), LocalDateTime.ofInstant(when, ZoneOffset.UTC));
    }
    private void save(UUID scope, FormResponse response, String targetField, String source, String report, LocalDateTime when) {
        db.update("INSERT INTO academic_file_check_reports VALUES (?,?,?,?,?,?)",
            scope, response.getId().toString(), targetField, source, report, Timestamp.valueOf(when));
    }

    @ParameterizedTest @ValueSource(strings = {"ACCESS_UNAVAILABLE", "DOWNLOAD_UNAVAILABLE"})
    void aSuccessfulLaterCheckResolvesOnlyAccessAlerts(String kind) {
        event(kind, alertAt);
        event("CONTENT_CHANGED", alertAt.minusSeconds(1));
        event("FILE_TYPE_CHANGED", alertAt.minusSeconds(2));
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        var results = events();
        assertThat(results.stream().filter(e -> e.kind().equals(kind))).allMatch(FileMonitorEventController.Event::resolved);
        assertThat(results.stream().filter(e -> !e.kind().equals(kind))).noneMatch(FileMonitorEventController.Event::resolved);
    }

    @ParameterizedTest @ValueSource(longs = {-1, 0})
    void anOldOrEqualTimeCheckCannotResolveTheAlert(long seconds) {
        event("ACCESS_UNAVAILABLE", alertAt);
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(seconds));
        assertThat(events().get(0).resolved()).isFalse();
    }

    @ParameterizedTest @ValueSource(strings = {"BLOCKED", "UNAVAILABLE", "NO_DOCUMENT", "UNREADABLE", "ENCRYPTED", "NOT_PDF", "NO_DOWNLOAD", "WRONG_FILE", "NO_ENCRYPTION_FLAG"})
    void partialMetadataOrUnreadableChecksCannotResolveAccess(String variant) {
        event("ACCESS_UNAVAILABLE", alertAt);
        var report = opened(url);
        switch (variant) {
            case "BLOCKED", "UNAVAILABLE" -> report.put("status", variant);
            case "NO_DOCUMENT" -> report.remove("document");
            case "UNREADABLE" -> ((ObjectNode) report.path("document")).put("readable", false);
            case "ENCRYPTED" -> ((ObjectNode) report.path("document")).put("encrypted", true);
            case "NOT_PDF" -> ((ObjectNode) report.path("metadata")).put("mimeType", "text/plain");
            case "NO_DOWNLOAD" -> ((ObjectNode) report.path("metadata")).put("canDownload", false);
            case "WRONG_FILE" -> ((ObjectNode) report.path("metadata")).put("fileId", "unrelated-file");
            case "NO_ENCRYPTION_FLAG" -> ((ObjectNode) report.path("document")).remove("encrypted");
        }
        check(first, fieldId, url, report, alertAt.plusSeconds(60));
        assertThat(events().get(0).resolved()).isFalse();
    }

    @Test void oneVerifiedExactSharedUrlResolvesEveryEligibleReferenceWithoutDuplicateChecks() {
        var second = response(url, "team-b");
        event("ACCESS_UNAVAILABLE", alertAt);
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        var result = events().get(0);
        assertThat(result.resolved()).isTrue();
        assertThat(result.responseIds()).containsExactlyInAnyOrder(first.getId(), second.getId());
    }

    @Test void aDifferentResourceKeyRemainsUnresolvedAndOnlyNamesItsOwnResponse() {
        String otherUrl = url.replace("key-a", "key-b");
        var second = response(otherUrl, "team-b");
        event("ACCESS_UNAVAILABLE", alertAt);
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        var result = events().get(0);
        assertThat(result.resolved()).isFalse();
        assertThat(result.responseIds()).containsExactly(second.getId());
        assertThat(result.teamCodes()).containsExactly("team-b");
    }

    @ParameterizedTest @ValueSource(strings = {"Provider Unavailable", "Download Failed"})
    void aLaterGenericProviderFailureDoesNotResurrectResolvedAccess(String flag) {
        event("ACCESS_UNAVAILABLE", alertAt);
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        check(first, fieldId, url, blocked(flag), alertAt.plusSeconds(120));
        assertThat(events().get(0).resolved()).isTrue();
    }

    @ParameterizedTest @ValueSource(strings = {"Inaccessible", "Download Disabled"})
    void aLaterDefiniteRestrictionReopensTheAlertAndANewSuccessResolvesIt(String flag) {
        event("ACCESS_UNAVAILABLE", alertAt);
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        check(first, fieldId, url, blocked(flag), alertAt.plusSeconds(120));
        assertThat(events().get(0).resolved()).isFalse();
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(180));
        assertThat(events().get(0).resolved()).isTrue();
    }

    @Test void aNewAccessFailureEventReopensAfterTheEarlierSuccess() {
        UUID old = event("ACCESS_UNAVAILABLE", alertAt);
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        UUID newer = event("ACCESS_UNAVAILABLE", alertAt.plusSeconds(120));
        assertThat(events().stream().filter(e -> e.id().equals(old)).findFirst().orElseThrow().resolved()).isTrue();
        assertThat(events().stream().filter(e -> e.id().equals(newer)).findFirst().orElseThrow().resolved()).isFalse();
    }

    @Test void aRetiredOrDisabledFieldCannotSupplyResolutionProof() {
        field = new DeliverableField(fieldId, deliverableId, "pdf", "PDF", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.OFF, false, true);
        event("ACCESS_UNAVAILABLE", alertAt);
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        assertThat(events().get(0).resolved()).isFalse();
    }

    @Test void anotherFieldWorkspaceOrSubmittedUrlCannotResolveTheCurrentArtifact() {
        event("ACCESS_UNAVAILABLE", alertAt);
        check(first, "another-field", url, opened(url), alertAt.plusSeconds(60));
        save(UUID.randomUUID(), first, fieldId, url, opened(url).toString(), LocalDateTime.ofInstant(alertAt.plusSeconds(60), ZoneOffset.UTC));
        String anotherUrl = "https://drive.google.com/file/d/another-file/view";
        check(first, fieldId, anotherUrl, opened(anotherUrl), alertAt.plusSeconds(60));
        assertThat(events().get(0).resolved()).isFalse();
    }

    @Test void anotherAdvisersResponseCannotSupplyHiddenResolutionProof() {
        var hidden = response(url, "team-b");
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADVISER));
        when(staff.assignedTeams("admin", workspace)).thenReturn(List.of("team-a"));
        event("ACCESS_UNAVAILABLE", alertAt);
        check(hidden, fieldId, url, opened(url), alertAt.plusSeconds(60));
        var result = events().get(0);
        assertThat(result.resolved()).isFalse();
        assertThat(result.responseIds()).containsExactly(first.getId());
    }

    @Test void readingResolvedAlertsDoesNotDismissOrChangeRecordedEvents() {
        UUID event = event("ACCESS_UNAVAILABLE", alertAt);
        db.update("INSERT INTO work_task_dismissals VALUES (?,?,?,?)", workspace, "admin", "file:" + event, Timestamp.from(alertAt));
        check(first, fieldId, url, opened(url), alertAt.plusSeconds(60));
        assertThat(events().get(0).resolved()).isTrue();
        assertThat(db.queryForObject("SELECT COUNT(*) FROM work_task_dismissals", Integer.class)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT kind FROM monitored_drive_events", String.class)).isEqualTo("ACCESS_UNAVAILABLE");
    }

    @ParameterizedTest @CsvSource({"UTC,2026-10-11T00:01:00,true", "UTC,2026-10-10T23:59:00,false",
        "Asia/Manila,2026-10-11T08:01:00,true", "Asia/Manila,2026-10-11T07:59:00,false"})
    void localCheckTimesUseTheBackendZoneRatherThanBrowserOrNaiveUtc(String zone, String checkedAt, boolean expected) {
        event("ACCESS_UNAVAILABLE", alertAt);
        save(workspace, first, fieldId, url, opened(url).toString(), LocalDateTime.parse(checkedAt));
        assertThat(controller(ZoneId.of(zone)).events(workspace, http).get(0).resolved()).isEqualTo(expected);
    }

    @Test void aRealManualDocumentCheckSuppliesTheSavedResolutionSignal() {
        event("ACCESS_UNAVAILABLE", Instant.now().minusSeconds(60));
        var drive = mock(GoogleDriveGateway.class);
        var inspector = mock(PdfInspector.class);
        var repository = mock(FileCheckReportRepository.class);
        var deliverables = mock(DeliverableRepository.class);
        var deliverable = new Deliverable(workspace, "SRS", "SRS", "srs", "", LocalDateTime.now(), true, DeliverableStatus.PUBLISHED);
        ReflectionTestUtils.setField(deliverable, "id", deliverableId);
        when(deliverables.findById(deliverableId)).thenReturn(Optional.of(deliverable));
        when(responses.findById(first.getId())).thenReturn(Optional.of(first));
        when(fields.findByIdAndDeliverableId(fieldId, deliverableId)).thenReturn(Optional.of(field));
        when(drive.isConfigured()).thenReturn(true);
        byte[] bytes = "%PDF-test".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        when(drive.getMetadata(any())).thenReturn(new DriveFileMetadata(fileId, "submission.pdf", "application/pdf", (long) bytes.length,
            null, OffsetDateTime.now(), true, url));
        when(drive.download(any())).thenReturn(bytes);
        when(inspector.inspect(any())).thenReturn(new PdfInspection(true, false, 2, 2000, "Readable authored content", ""));
        when(repository.save(any())).thenAnswer(inv -> {
            FileCheckReport report = inv.getArgument(0);
            save(report.getWorkspaceId(), first, report.getFieldId(), report.getSourceUrl(), report.getReportJson(), report.getCheckedAt());
            return report;
        });
        var checks = new FileCheckService(drive, new GoogleDriveProperties(true, "", 25_000_000), inspector,
            mock(TemplateComparator.class), mock(DocumentTemplateService.class), repository, responses, deliverables, fields,
            json, new FileCheckProperties(100, .85, .15));
        assertThat(checks.check(workspace, new FileCheckRequest(first.getId().toString(), fieldId, "SRS", url, first.getUpdatedAt().toString())).status())
            .isEqualTo("COMPLETED");
        assertThat(controller(ZoneId.systemDefault()).events(workspace, http).get(0).resolved()).isTrue();
        verify(drive, times(1)).getMetadata(any());
        verify(drive, times(1)).download(any());
    }
}
