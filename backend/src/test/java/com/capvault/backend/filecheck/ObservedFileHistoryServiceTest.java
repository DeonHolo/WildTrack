package com.capvault.backend.filecheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import java.util.Optional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.capvault.backend.student.RegisteredDriveStudentResolver;
import org.junit.jupiter.api.Test;

class ObservedFileHistoryServiceTest {

    @Test void staffObservationAttributesOnlyStructuredProviderEmailsAndMemoizesRepeatedActors() {
        UUID workspaceId = UUID.randomUUID();
        String responseId = UUID.randomUUID().toString();
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);
        RegisteredDriveStudentResolver resolver = mock(RegisteredDriveStudentResolver.class);
        var student = new RegisteredDriveStudentResolver.Student("LAST, FIRST", "owner@example.edu");
        FileCheckReport observed = report(responseId, "pdf", "https://drive.google.com/file/d/a/view",
            "2026-09-18T10:00:00", metadata("a", "report.pdf", "aaa",
                "2026-09-18T01:00:00Z", "owner@example.edu", "Provider Pretender"),
            "owner@example.edu", "Provider Pretender");
        when(observed.getDriveOwnerDisplay()).thenReturn("Google Unverified Owner Name");
        when(observed.getDriveOwnerEmail()).thenReturn("owner@example.edu");
        when(resolver.resolve(workspaceId, "owner@example.edu")).thenReturn(Optional.of(student));
        when(reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId,
            List.of(responseId))).thenReturn(List.of(observed));
        var item = new ObservedFileHistoryService(reports, new ObjectMapper().findAndRegisterModules(), resolver)
            .forResponses(workspaceId, List.of(responseId)).byField().get(responseId).get("pdf").observations().get(0);
        assertThat(item.driveOwnerStudent()).isEqualTo(student);
        assertThat(item.modifiedByStudent()).isEqualTo(student);
        assertThat(item.driveOwner()).isEqualTo("Google Unverified Owner Name");
        verify(resolver, times(1)).resolve(workspaceId, "owner@example.edu");
    }

    @Test void oldOwnerDisplayAndProviderEditorDisplayAloneNeverIdentifyRegisteredStudent() {
        UUID workspaceId = UUID.randomUUID();
        String responseId = UUID.randomUUID().toString();
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);
        RegisteredDriveStudentResolver resolver = mock(RegisteredDriveStudentResolver.class);
        FileCheckReport observed = report(responseId, "pdf", "https://drive.google.com/file/d/a/view",
            "2026-09-18T10:00:00", metadata("a", "report.pdf", "aaa",
                "2026-09-18T01:00:00Z", null, "LAST, FIRST"), null, "LAST, FIRST");
        when(observed.getDriveOwnerDisplay()).thenReturn("LAST, FIRST (owner@example.edu)");
        when(reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId,
            List.of(responseId))).thenReturn(List.of(observed));
        var item = new ObservedFileHistoryService(reports, new ObjectMapper().findAndRegisterModules(), resolver)
            .forResponses(workspaceId, List.of(responseId)).byField().get(responseId).get("pdf").observations().get(0);
        assertThat(item.driveOwnerStudent()).isNull();
        assertThat(item.modifiedByStudent()).isNull();
        org.mockito.Mockito.verifyNoInteractions(resolver);
    }

    @Test
    void deduplicatesSameContentAndMarksVerifiedChecksumChange() {
        UUID workspaceId = UUID.randomUUID();
        String responseId = UUID.randomUUID().toString();
        String fieldId = "framework-pdf";
        String sourceUrl = "https://drive.google.com/file/d/file-1/view";
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);

        FileCheckReport first = report(responseId, fieldId, sourceUrl, "2026-09-18T10:00:00", metadata(
            "file-1", "framework.pdf", "aaa", "2026-09-18T01:00:00Z", "maria@example.edu", "Untrusted Drive Name"),
            "maria@example.edu", "Untrusted Drive Name");
        FileCheckReport repeated = report(responseId, fieldId, sourceUrl, "2026-09-18T11:00:00", metadata(
            "file-1", "framework.pdf", "aaa", "2026-09-18T01:00:00Z", "maria@example.edu", "Other Drive Name"),
            "maria@example.edu", "Untrusted Drive Name");
        FileCheckReport changed = report(responseId, fieldId, sourceUrl, "2026-09-18T12:00:00", metadata(
            "file-1", "framework.pdf", "bbb", "2026-09-18T03:00:00Z", "maria@example.edu", "Another Name"),
            "maria@example.edu", "Another Name");
        when(reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId, List.of(responseId)))
            .thenReturn(List.of(first, repeated, changed));

        ObservedFileHistoryService service = new ObservedFileHistoryService(
            reports, new ObjectMapper().findAndRegisterModules(), mock(RegisteredDriveStudentResolver.class));
        ObservedFileHistoryView history = service.forResponses(workspaceId, List.of(responseId))
            .byField().get(responseId).get(fieldId);

        assertThat(history.sourceLabel()).isEqualTo("WildTrack Document Check observation");
        assertThat(history.coverageMessage()).contains("only file states WildTrack observed");
        assertThat(history.olderRevisionHistoryMessage()).contains("unavailable");
        assertThat(history.observations()).hasSize(2);
        assertThat(history.observations().get(0).changeType()).isEqualTo("CONTENT_CHANGED");
        assertThat(history.observations().get(0).contentIdentifier()).isEqualTo("md5:bbb");
        assertThat(history.observations().get(0).modifiedBy()).isEqualTo("maria@example.edu");
        assertThat(history.observations().get(0).providerDisplayName()).isEqualTo("Another Name");
        assertThat(history.observations().get(1).changeType()).isEqualTo("FIRST_OBSERVED");
        assertThat(history.observations().get(1).firstObservedAt()).isEqualTo(LocalDateTime.parse("2026-09-18T10:00:00"));
        assertThat(history.observations().get(1).lastObservedAt()).isEqualTo(LocalDateTime.parse("2026-09-18T11:00:00"));
    }

    @Test
    void exposesReturnedEmailWithoutInventingNameAndLabelsMissingEditorUnavailable() {
        UUID workspaceId = UUID.randomUUID();
        String responseId = UUID.randomUUID().toString();
        String fieldId = "report-pdf";
        String sourceUrl = "https://drive.google.com/file/d/file-2/view";
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);

        FileCheckReport emailOnly = report(responseId, fieldId, sourceUrl, "2026-09-18T10:00:00", metadata(
            "file-2", "report.pdf", "aaa", "2026-09-18T01:00:00Z", "outside@example.com", "Provider Display Name"),
            "outside@example.com", "Provider Display Name");
        FileCheckReport noEditor = report(responseId, fieldId, sourceUrl, "2026-09-18T11:00:00", metadata(
            "file-2", "report.pdf", "bbb", "2026-09-18T02:00:00Z", null, null), null, null);
        when(reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId, List.of(responseId)))
            .thenReturn(List.of(emailOnly, noEditor));

        ObservedFileHistoryService service = new ObservedFileHistoryService(
            reports, new ObjectMapper().findAndRegisterModules(), mock(RegisteredDriveStudentResolver.class));
        var observations = service.forResponses(workspaceId, List.of(responseId))
            .byField().get(responseId).get(fieldId).observations();

        assertThat(observations).hasSize(2);
        assertThat(observations.get(0).modifiedBy()).isEqualTo("Unavailable");
        assertThat(observations.get(0).editorMetadataAvailable()).isFalse();
        assertThat(observations.get(1).modifiedBy()).isEqualTo("outside@example.com");
        assertThat(observations.get(1).editorMetadataAvailable()).isTrue();
        assertThat(observations.get(1).modifiedBy()).doesNotContain("Provider Display Name");
    }

    @Test
    void keepsSameChecksumMetadataChangeWithoutCallingItContentChange() {
        UUID workspaceId = UUID.randomUUID();
        String responseId = UUID.randomUUID().toString();
        String fieldId = "report-pdf";
        String sourceUrl = "https://drive.google.com/file/d/file-3/view";
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);

        FileCheckReport first = report(responseId, fieldId, sourceUrl, "2026-09-18T10:00:00", metadata(
            "file-3", "report.pdf", "same", "2026-09-18T01:00:00Z", "first@example.com", "First"),
            "first@example.com", "First");
        FileCheckReport metadataChanged = report(responseId, fieldId, sourceUrl, "2026-09-18T11:00:00", metadata(
            "file-3", "report.pdf", "same", "2026-09-18T02:00:00Z", "second@example.com", "Second"),
            "second@example.com", "Second");
        when(reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId, List.of(responseId)))
            .thenReturn(List.of(first, metadataChanged));

        var observations = new ObservedFileHistoryService(reports, new ObjectMapper().findAndRegisterModules(), mock(RegisteredDriveStudentResolver.class))
            .forResponses(workspaceId, List.of(responseId)).byField().get(responseId).get(fieldId).observations();

        assertThat(observations).hasSize(2);
        assertThat(observations.get(0).changeType()).isEqualTo("METADATA_CHANGED");
        assertThat(observations.get(0).contentIdentifier()).isEqualTo("md5:same");
        assertThat(observations.get(0).modifiedBy()).isEqualTo("second@example.com");
    }

    @Test
    void preservesProviderDisplayNameWhenDriveHidesEmail() {
        UUID workspaceId = UUID.randomUUID();
        String responseId = UUID.randomUUID().toString();
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);
        FileCheckReport displayOnly = report(responseId, "pdf", "https://drive.google.com/file/d/file-4/view",
            "2026-09-18T10:00:00", metadata("file-4", "report.pdf", "same", "2026-09-18T01:00:00Z", null, "Visible Drive Name"),
            null, "Visible Drive Name");
        when(reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId, List.of(responseId)))
            .thenReturn(List.of(displayOnly));

        var observation = new ObservedFileHistoryService(reports, new ObjectMapper().findAndRegisterModules(), mock(RegisteredDriveStudentResolver.class))
            .forResponses(workspaceId, List.of(responseId)).byField().get(responseId).get("pdf").observations().get(0);

        assertThat(observation.modifiedBy()).isEqualTo("Visible Drive Name");
        assertThat(observation.editorMetadataAvailable()).isTrue();
        assertThat(observation.editorMetadataSource()).isEqualTo("Google Drive File metadata");
    }

    @Test
    void exposesCreationTimeAndDriveOwnerOnlyFromObservedStaffMetadata() {
        UUID workspaceId = UUID.randomUUID();
        String responseId = UUID.randomUUID().toString();
        FileCheckReportRepository reports = mock(FileCheckReportRepository.class);
        FileCheckReport report = report(responseId, "pdf",
            "https://drive.google.com/file/d/creation-file/view", "2026-09-18T10:00:00",
            metadata("creation-file", "report.pdf", "abc", "2026-09-18T01:00:00Z", null, null),
            null, null);
        when(report.getDriveCreatedTime()).thenReturn("2026-09-01T08:00:00Z");
        when(report.getDriveOwnerDisplay()).thenReturn("Owner from Drive");
        when(reports.findAllByWorkspaceIdAndExternalResponseIdInOrderByCheckedAtAsc(workspaceId, List.of(responseId)))
            .thenReturn(List.of(report));

        var observed = new ObservedFileHistoryService(reports, new ObjectMapper().findAndRegisterModules(), mock(RegisteredDriveStudentResolver.class))
            .forResponses(workspaceId, List.of(responseId)).byField().get(responseId).get("pdf").observations().get(0);
        assertThat(observed.driveCreatedTime()).isEqualTo(java.time.OffsetDateTime.parse("2026-09-01T08:00:00Z"));
        assertThat(observed.driveOwner()).isEqualTo("Owner from Drive");
        assertThat(observed.modifiedBy()).isEqualTo("Unavailable");
    }

    private static FileCheckReport report(
        String responseId,
        String fieldId,
        String sourceUrl,
        String checkedAt,
        String metadataJson
    ) {
        return report(responseId, fieldId, sourceUrl, checkedAt, metadataJson, null, null);
    }

    private static FileCheckReport report(
        String responseId,
        String fieldId,
        String sourceUrl,
        String checkedAt,
        String metadataJson,
        String editorEmail,
        String editorDisplayName
    ) {
        FileCheckReport report = mock(FileCheckReport.class);
        when(report.getExternalResponseId()).thenReturn(responseId);
        when(report.getFieldId()).thenReturn(fieldId);
        when(report.getSourceUrl()).thenReturn(sourceUrl);
        when(report.getCheckedAt()).thenReturn(LocalDateTime.parse(checkedAt));
        when(report.getReportJson()).thenReturn("{\"metadata\":" + metadataJson + "}");
        when(report.getDriveLastModifyingUserEmail()).thenReturn(editorEmail);
        when(report.getDriveLastModifyingUserDisplayName()).thenReturn(editorDisplayName);
        return report;
    }

    private static String metadata(
        String fileId,
        String name,
        String checksum,
        String modifiedTime,
        String email,
        String displayName
    ) {
        return "{" +
            "\"fileId\":\"" + fileId + "\"," +
            "\"name\":\"" + name + "\"," +
            "\"md5Checksum\":\"" + checksum + "\"," +
            "\"modifiedTime\":\"" + modifiedTime + "\"," +
            "\"lastModifyingUserEmail\":" + json(email) + "," +
            "\"lastModifyingUserDisplayName\":" + json(displayName) +
            "}";
    }

    private static String json(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }
}
