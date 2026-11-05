package com.capvault.backend.filemonitor;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class ContentChangeAcknowledgementTest {
    @ParameterizedTest
    @CsvSource({ "ADMIN,pdf", "ADMIN,deliverable:legacy", "ADMIN,",
        "ADVISER,pdf", "ADVISER,deliverable:legacy", "ADVISER," })
    void acknowledgementDismissesOnlyTheSameContentRevisionForTheSameAccountAndWorkspace(StaffRole role, String reportField) {
        var db=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa",""));
        db.execute("CREATE TABLE work_task_dismissals(workspace_id UUID,google_subject VARCHAR(320),task_key VARCHAR(500),dismissed_at TIMESTAMP WITH TIME ZONE,deleted_at TIMESTAMP WITH TIME ZONE,PRIMARY KEY(workspace_id,google_subject,task_key))");
        db.execute("CREATE TABLE academic_file_check_reports(workspace_id UUID,external_response_id VARCHAR(240),field_id VARCHAR(80),checked_at TIMESTAMP,report_json TEXT)");
        db.execute("CREATE TABLE monitored_drive_events(id UUID,workspace_id UUID,file_id VARCHAR(240),kind VARCHAR(60),current_checksum VARCHAR(128),provider_modified_at TIMESTAMP WITH TIME ZONE,observed_at TIMESTAMP WITH TIME ZONE)");
        UUID workspace=UUID.randomUUID(), response=UUID.randomUUID(), event=UUID.randomUUID(), next=UUID.randomUUID();
        var observed=Instant.now().minusSeconds(30).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        var modified=observed.minusSeconds(10);
        String checksum="a".repeat(32);
        String report="{\"metadata\":{\"fileId\":\"file\",\"md5Checksum\":\""+checksum+"\",\"modifiedTime\":\""+modified+"\"}}";
        db.update("INSERT INTO academic_file_check_reports VALUES(?,?,?,?,?)", workspace, response.toString(), reportField,
            LocalDateTime.ofInstant(observed, ZoneOffset.UTC).plusNanos(123_000), report);
        db.update("INSERT INTO monitored_drive_events VALUES(?,?,?,?,?,?,?)",event,workspace,"file","CONTENT_CHANGED",checksum,java.sql.Timestamp.from(modified),java.sql.Timestamp.from(observed));
        // Even a later revision with identical bytes is a different notification.
        db.update("INSERT INTO monitored_drive_events VALUES(?,?,?,?,?,?,?)",next,workspace,"file","CONTENT_CHANGED",checksum,java.sql.Timestamp.from(modified.plusSeconds(10)),java.sql.Timestamp.from(observed.plusSeconds(10)));
        var security=mock(StudentAssociationSecurity.class); var http=mock(HttpServletRequest.class);
        when(security.requireSession(http)).thenReturn(new StoredWildTrackSession("session","staff","staff@test.invalid",Instant.now(),Instant.now().plusSeconds(60)));
        when(security.activeRoles(http)).thenReturn(Set.of(role));
        var controller=new WorkTaskDismissalController(db,security);
        String field = reportField == null ? "pdf" : reportField;
        String key = "document-change:" + response + ":" + field + ":file:md5:" + checksum + ":" + observed;
        var result=controller.dismiss(new WorkTaskDismissalController.Action(workspace,key),http);
        assertThat(result).containsExactly(key,"file:file:"+event);
        assertThat(controller.list(workspace,http)).containsExactlyInAnyOrderElementsOf(result);
        assertThat(controller.list(UUID.randomUUID(),http)).isEmpty();
        assertThat(controller.list(workspace,http)).doesNotContain("file:file:"+next);
        when(security.requireSession(http)).thenReturn(new StoredWildTrackSession("other-session","other","other@test.invalid",Instant.now(),Instant.now().plusSeconds(60)));
        when(security.activeRoles(http)).thenReturn(Set.of(StaffRole.ADMIN));
        assertThat(controller.list(workspace,http)).isEmpty();
    }
}
