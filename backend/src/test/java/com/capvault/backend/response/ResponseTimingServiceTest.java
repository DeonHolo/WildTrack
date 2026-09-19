package com.capvault.backend.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.filecheck.FileCheckReport;
import com.capvault.backend.filecheck.FileCheckReportRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ResponseTimingServiceTest {

    private final DeliverableRepository deliverables = mock(DeliverableRepository.class);
    private final DeliverableFieldRepository fields = mock(DeliverableFieldRepository.class);
    private final FormResponseVersionRepository versions = mock(FormResponseVersionRepository.class);
    private final FileCheckReportRepository checks = mock(FileCheckReportRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private ResponseTimingService service;

    private UUID workspaceId;
    private UUID deliverableId;
    private Deliverable deliverable;

    @BeforeEach
    void setUp() {
        service = new ResponseTimingService(deliverables, fields, versions, checks, objectMapper);
        workspaceId = UUID.randomUUID();
        deliverableId = UUID.randomUUID();
        deliverable = new Deliverable(
            workspaceId, "SRS", "Refactored SRS", "refactored-srs",
            "Submit artifacts", LocalDateTime.parse("2026-09-19T23:59:00"), false, DeliverableStatus.PUBLISHED);
        // The entity generates its own id, so repository lookup is keyed by that generated id.
        deliverableId = deliverable.getId();
        when(deliverables.findById(deliverableId)).thenReturn(Optional.of(deliverable));
    }

    @Test
    void ignoresTextAndChoiceEditsButCountsNonPdfArtifactSaveAcrossManilaDeadlineBoundary() throws Exception {
        DeliverableField link = field("link-field", "primaryLink", "Submission Link", DeliverableFieldType.GENERAL_URL, 0);
        DeliverableField validation = field("step-field", "validationStep", "Validation Step", DeliverableFieldType.MULTIPLE_CHOICE, 1);
        DeliverableField note = field("note-field", "note", "Note", DeliverableFieldType.SHORT_TEXT, 2);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId))
            .thenReturn(List.of(link, validation, note));

        Instant submittedAt = Instant.parse("2026-09-19T15:59:00Z"); // exactly 23:59 Asia/Manila
        FormResponse response = response(submittedAt, Map.of(
            "primaryLink", "https://example.test/final",
            "validationStep", "Revised submission",
            "note", "edited note"));
        FormResponseVersion v1 = version(response, 1, Instant.parse("2026-09-19T16:05:00Z"), Map.of(
            "primaryLink", "https://example.test/initial",
            "validationStep", "Initial submission",
            "note", "original note"));
        FormResponseVersion v2 = version(response, 2, Instant.parse("2026-09-19T16:30:00Z"), Map.of(
            "primaryLink", "https://example.test/initial",
            "validationStep", "Revised submission",
            "note", "edited note"));
        when(versions.findAllByResponseIdOrderByRevisionAsc(response.getId())).thenReturn(List.of(v1, v2));

        ResponseTimingView timing = service.forResponse(response);

        assertThat(timing.initialSubmittedAt()).isEqualTo(submittedAt);
        assertThat(timing.lastMaterialArtifactSavedAt()).isEqualTo(Instant.parse("2026-09-19T16:30:00Z"));
        assertThat(timing.effectiveSubmittedAt()).isEqualTo(Instant.parse("2026-09-19T16:30:00Z"));
        assertThat(timing.effectiveReason()).isEqualTo("Material artifact save");
        assertThat(timing.late()).isTrue();
        assertThat(timing.daysLate()).isEqualTo(1);
        assertThat(timing.contributors()).extracting(ResponseTimingView.Contributor::type)
            .containsExactly("INITIAL_SUBMISSION", "MATERIAL_ARTIFACT_SAVE");
    }

    @Test
    void metadataModifiedTimeAndCheckExecutionDoNotCountWhenSameLinkChecksumIsUnchanged() throws Exception {
        DeliverableField pdf = field("pdf-field", "documentPdf", "SRS PDF", DeliverableFieldType.DRIVE_PDF, 0);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId)).thenReturn(List.of(pdf));
        Instant submittedAt = Instant.parse("2026-09-19T15:00:00Z");
        String url = "https://drive.google.com/file/d/same/view";
        FormResponse response = response(submittedAt, Map.of("documentPdf", url));
        when(versions.findAllByResponseIdOrderByRevisionAsc(response.getId())).thenReturn(List.of());
        FileCheckReport later = report(url, "same-hash", "2026-09-20T08:00:00+08:00", LocalDateTime.parse("2026-09-20T09:00:00"));
        FileCheckReport earlier = report(url, "same-hash", "2026-09-19T20:00:00+08:00", LocalDateTime.parse("2026-09-19T21:00:00"));
        when(checks.findAllByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
            workspaceId, response.getId().toString(), "pdf-field"))
            .thenReturn(List.of(later, earlier));

        ResponseTimingView timing = service.forResponse(response);

        assertThat(timing.verifiedContentModifiedAt()).isNull();
        assertThat(timing.effectiveSubmittedAt()).isEqualTo(submittedAt);
        assertThat(timing.effectiveReason()).isEqualTo("Initial submission");
        assertThat(timing.artifactEvidence()).singleElement().satisfies(item -> {
            assertThat(item.contentEvidenceStatus()).isEqualTo("NO_VERIFIED_CHANGE");
            assertThat(item.message()).contains("metadata/check times do not count");
        });
    }

    @Test
    void multiplePdfsUseOnlyVerifiedSameLinkChecksumChangeAndItsModifiedTime() throws Exception {
        DeliverableField firstPdf = field("pdf-a", "frameworkPdf", "Framework PDF", DeliverableFieldType.DRIVE_PDF, 0);
        DeliverableField secondPdf = field("pdf-b", "highlightsPdf", "Highlights PDF", DeliverableFieldType.DRIVE_PDF, 1);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId)).thenReturn(List.of(firstPdf, secondPdf));
        String firstUrl = "https://drive.google.com/file/d/framework/view";
        String secondUrl = "https://drive.google.com/file/d/highlights/view";
        FormResponse response = response(Instant.parse("2026-09-19T15:00:00Z"), Map.of(
            "frameworkPdf", firstUrl, "highlightsPdf", secondUrl));
        when(versions.findAllByResponseIdOrderByRevisionAsc(response.getId())).thenReturn(List.of());
        FileCheckReport firstNew = report(firstUrl, "hash-new", "2026-09-20T01:15:00+08:00", LocalDateTime.parse("2026-09-20T02:00:00"));
        FileCheckReport firstOld = report(firstUrl, "hash-old", "2026-09-19T19:00:00+08:00", LocalDateTime.parse("2026-09-19T20:00:00"));
        FileCheckReport secondNew = report(secondUrl, "stable", "2026-09-20T04:00:00+08:00", LocalDateTime.parse("2026-09-20T05:00:00"));
        FileCheckReport secondOld = report(secondUrl, "stable", "2026-09-19T18:00:00+08:00", LocalDateTime.parse("2026-09-19T19:00:00"));
        when(checks.findAllByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
            workspaceId, response.getId().toString(), "pdf-a"))
            .thenReturn(List.of(firstNew, firstOld));
        when(checks.findAllByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
            workspaceId, response.getId().toString(), "pdf-b"))
            .thenReturn(List.of(secondNew, secondOld));

        ResponseTimingView timing = service.forResponse(response);

        assertThat(timing.verifiedContentModifiedAt()).isEqualTo(Instant.parse("2026-09-19T17:15:00Z"));
        assertThat(timing.effectiveSubmittedAt()).isEqualTo(Instant.parse("2026-09-19T17:15:00Z"));
        assertThat(timing.effectiveReason()).isEqualTo("Verified same-link PDF content modification");
        assertThat(timing.artifactEvidence()).extracting(ResponseTimingView.ArtifactEvidence::contentEvidenceStatus)
            .containsExactly("VERIFIED_CHANGE", "NO_VERIFIED_CHANGE");
        assertThat(timing.late()).isTrue();
    }

    @Test
    void unavailableOrMalformedDriveTimesAreExplicitAndNeverGuessed() throws Exception {
        DeliverableField pdf = field("pdf-field", "documentPdf", "SRS PDF", DeliverableFieldType.DRIVE_PDF, 0);
        when(fields.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId)).thenReturn(List.of(pdf));
        String url = "https://drive.google.com/file/d/same/view";
        Instant submittedAt = Instant.parse("2026-09-19T15:00:00Z");
        FormResponse response = response(submittedAt, Map.of("documentPdf", url));
        when(versions.findAllByResponseIdOrderByRevisionAsc(response.getId())).thenReturn(List.of());
        FileCheckReport malformedNew = report(url, "new-hash", "not-a-time", LocalDateTime.parse("2026-09-20T03:00:00"));
        FileCheckReport noTimeOld = report(url, "old-hash", null, LocalDateTime.parse("2026-09-19T20:00:00"));
        when(checks.findAllByWorkspaceIdAndExternalResponseIdAndFieldIdOrderByCheckedAtDesc(
            workspaceId, response.getId().toString(), "pdf-field"))
            .thenReturn(List.of(malformedNew, noTimeOld));

        ResponseTimingView timing = service.forResponse(response);

        assertThat(timing.verifiedContentModifiedAt()).isNull();
        assertThat(timing.effectiveSubmittedAt()).isEqualTo(submittedAt);
        assertThat(timing.artifactEvidence()).singleElement().satisfies(item -> {
            assertThat(item.contentEvidenceStatus()).isEqualTo("VERIFIED_CHANGE_TIME_UNAVAILABLE");
            assertThat(item.message()).contains("no usable Drive modifiedTime").contains("no file timestamp was guessed");
        });
    }

    private DeliverableField field(String id, String key, String label, DeliverableFieldType type, int order) {
        return new DeliverableField(id, deliverableId, key, label, type, false, order,
            type == DeliverableFieldType.DRIVE_PDF ? DocumentCheckPolicy.MANUAL : DocumentCheckPolicy.OFF,
            false, true);
    }

    private FormResponse response(Instant submittedAt, Map<String, Object> values) throws Exception {
        return new FormResponse(
            UUID.randomUUID(), workspaceId, deliverableId, "subject", "student@example.test", UUID.randomUUID(),
            "26-0001", "Student One", "TEAM-01", objectMapper.writeValueAsString(values), submittedAt, submittedAt);
    }

    private FormResponseVersion version(FormResponse response, long revision, Instant savedAt, Map<String, Object> values) throws Exception {
        return new FormResponseVersion(UUID.randomUUID(), response, objectMapper.writeValueAsString(values), revision, savedAt);
    }

    private FileCheckReport report(String url, String md5, String modifiedTime, LocalDateTime checkedAt) throws Exception {
        FileCheckReport report = mock(FileCheckReport.class);
        when(report.getSourceUrl()).thenReturn(url);
        when(report.getCheckedAt()).thenReturn(checkedAt);
        Map<String, Object> metadata = new java.util.LinkedHashMap<>();
        metadata.put("md5Checksum", md5);
        metadata.put("modifiedTime", modifiedTime);
        when(report.getReportJson()).thenReturn(objectMapper.writeValueAsString(Map.of("metadata", metadata)));
        return report;
    }
}
