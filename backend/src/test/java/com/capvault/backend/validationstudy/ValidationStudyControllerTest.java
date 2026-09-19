package com.capvault.backend.validationstudy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldOption;
import com.capvault.backend.deliverable.DeliverableFieldOptionRepository;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.response.FormResponseVersion;
import com.capvault.backend.response.FormResponseVersionRepository;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ValidationStudyControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired WildTrackSessionService sessions;
    @Autowired StaffRoleAssignmentRepository staffRoles;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired DeliverableRepository deliverables;
    @Autowired DeliverableFieldRepository fields;
    @Autowired DeliverableFieldOptionRepository options;
    @Autowired FormResponseRepository responses;
    @Autowired FormResponseVersionRepository versions;
    @Autowired ValidationStudyService service;

    private AcademicWorkspace workspace;
    private Deliverable deliverable;
    private String validationFieldId;

    @BeforeEach
    void seedStudyDeliverable() {
        String token = UUID.randomUUID().toString().substring(0, 8);
        workspace = workspaces.saveAndFlush(new AcademicWorkspace(
            "Validation Study " + token, "IT", "VAL-" + token, "Semester 1", "2098-99", true));
        deliverable = deliverables.saveAndFlush(new Deliverable(
            workspace.getId(), "Refactored SRS", "Refactored SRS", "refactored-srs-" + token,
            "Validation study form", LocalDateTime.of(2098, 12, 31, 23, 59), true, DeliverableStatus.PUBLISHED));

        validationFieldId = "validation-step-" + token;
        fields.saveAndFlush(new DeliverableField(
            validationFieldId, deliverable.getId(), "validationStep", "Validation Step",
            DeliverableFieldType.MULTIPLE_CHOICE, true, 0, DocumentCheckPolicy.OFF, false, true));
        options.saveAndFlush(new DeliverableFieldOption("initial-" + token, validationFieldId, "Initial submission", 0));
        options.saveAndFlush(new DeliverableFieldOption("revised-" + token, validationFieldId, "Revised submission", 1));
        fields.saveAndFlush(new DeliverableField(
            "pdf-" + token, deliverable.getId(), "documentPdf", "Refactored SRS PDF Link",
            DeliverableFieldType.DRIVE_PDF, true, 1, DocumentCheckPolicy.MANUAL, false, true));
        fields.saveAndFlush(new DeliverableField(
            "notes-" + token, deliverable.getId(), "notes", "Notes",
            DeliverableFieldType.SHORT_TEXT, false, 2, DocumentCheckPolicy.OFF, false, true));
    }

    @Test
    void computesBulkT1T2EvidenceAndCountsWithoutExposingGoogleIdentity() throws Exception {
        String initialOption = options.findAllByFieldIdOrderByDisplayOrderAscLabelAsc(validationFieldId).get(0).getId();
        String revisedOption = options.findAllByFieldIdOrderByDisplayOrderAscLabelAsc(validationFieldId).get(1).getId();
        String stablePdf = "https://drive.google.com/file/d/stable-srs/view";

        FormResponse passing = revisedResponse(
            "26-0001", "Passing Student", "TEAM-01", "study-google-subject-secret", "study-secret@example.test",
            initialOption, revisedOption, stablePdf, stablePdf, "same note");
        currentInitialResponse(
            "26-0002", "T1 Student", "TEAM-02", "initial-only-subject", "initial-only@example.test",
            initialOption, "https://drive.google.com/file/d/initial-only/view", "same note");
        revisedResponse(
            "26-0003", "Changed PDF Student", "TEAM-03", "changed-pdf-subject", "changed-pdf@example.test",
            initialOption, revisedOption,
            "https://drive.google.com/file/d/original/view",
            "https://drive.google.com/file/d/changed/view",
            "same note");

        ValidationStudyService.Evidence evidence = service.evidence(workspace.getId(), deliverable.getId());
        assertThat(evidence.counts().uniqueCurrentResponses()).isEqualTo(3);
        assertThat(evidence.counts().uniqueCurrentStudents()).isEqualTo(3);
        assertThat(evidence.counts().t1Observed()).isEqualTo(3);
        assertThat(evidence.counts().t2Complete()).isEqualTo(2);
        assertThat(evidence.counts().passingBoth()).isEqualTo(1);
        assertThat(evidence.validationStepFieldLabel()).isEqualTo("Validation Step");
        assertThat(evidence.artifactFieldLabel()).isEqualTo("Refactored SRS PDF Link");

        ValidationStudyService.ResponseEvidence passingEvidence = evidence.responses().stream()
            .filter(row -> row.responseId().equals(passing.getId())).findFirst().orElseThrow();
        assertThat(passingEvidence.validationStepValue()).isEqualTo("Revised submission");
        assertThat(passingEvidence.history()).hasSize(1);
        assertThat(passingEvidence.history().get(0).validationStepValue()).isEqualTo("Initial submission");
        assertThat(passingEvidence.checks().initialSubmissionSeen()).isTrue();
        assertThat(passingEvidence.checks().revisedSubmissionCurrent()).isTrue();
        assertThat(passingEvidence.checks().sameResponse()).isTrue();
        assertThat(passingEvidence.checks().materialEditHistoryPresent()).isTrue();
        assertThat(passingEvidence.checks().revisionIncreased()).isTrue();
        assertThat(passingEvidence.checks().pdfUnchanged()).isTrue();
        assertThat(passingEvidence.checks().nonDesignatedValuesPreserved()).isTrue();
        assertThat(passingEvidence.checks().overallPass()).isTrue();

        mockMvc.perform(get("/api/validation-study/evidence")
                .param("workspaceId", workspace.getId().toString())
                .param("deliverableId", deliverable.getId().toString())
                .cookie(sessionCookie("study-admin", "study-admin@example.test", StaffRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.counts.uniqueCurrentResponses").value(3))
            .andExpect(jsonPath("$.responses[0].responseId").exists())
            .andExpect(jsonPath("$.responses[0].studentNumber").exists())
            .andExpect(jsonPath("$.responses[0].checks.overallPass").exists())
            .andExpect(jsonPath("$.responses[0].history").isArray())
            .andExpect(content().string(not(containsString("study-google-subject-secret"))))
            .andExpect(content().string(not(containsString("study-secret@example.test"))))
            .andExpect(content().string(not(containsString("googleSubject"))))
            .andExpect(content().string(not(containsString("googleEmail"))));
    }

    @Test
    void endpointIsAdminOnlyAndDeliverableMustBelongToWorkspace() throws Exception {
        Cookie adviser = sessionCookie("study-adviser", "study-adviser@example.test", StaffRole.ADVISER);
        Cookie ordinary = sessionCookie("study-student", "study-student@example.test");

        mockMvc.perform(get("/api/validation-study/evidence")
                .param("workspaceId", workspace.getId().toString())
                .param("deliverableId", deliverable.getId().toString())
                .cookie(adviser))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/validation-study/evidence")
                .param("workspaceId", workspace.getId().toString())
                .param("deliverableId", deliverable.getId().toString())
                .cookie(ordinary))
            .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/validation-study/evidence")
                .param("workspaceId", workspace.getId().toString())
                .param("deliverableId", deliverable.getId().toString()))
            .andExpect(status().isUnauthorized());

        AcademicWorkspace other = workspaces.saveAndFlush(new AcademicWorkspace(
            "Other validation workspace " + UUID.randomUUID(), "IT", "VAL-OTHER-" + UUID.randomUUID(), "Semester 1", "2098-99", true));
        mockMvc.perform(get("/api/validation-study/evidence")
                .param("workspaceId", other.getId().toString())
                .param("deliverableId", deliverable.getId().toString())
                .cookie(sessionCookie("study-other-admin", "other-admin@example.test", StaffRole.ADMIN)))
            .andExpect(status().isBadRequest());
    }

    @Test
    void nonStudyDeliverableWithExistingResponsesReturnsWarningsInsteadOfGuessingFields() throws Exception {
        Deliverable other = deliverables.saveAndFlush(new Deliverable(
            workspace.getId(), "Other", "Other Deliverable", "other-" + UUID.randomUUID(),
            "Not the frozen study form", LocalDateTime.of(2098, 12, 31, 23, 59), false, DeliverableStatus.PUBLISHED));
        Instant now = Instant.parse("2098-09-19T03:00:00Z");
        responses.saveAndFlush(new FormResponse(
            UUID.randomUUID(), workspace.getId(), other.getId(), "other-subject-secret", "other-secret@example.test", UUID.randomUUID(),
            "26-0099", "Other Student", "TEAM-99", "{\"legacy\":\"value\"}", now, now));

        ValidationStudyService.Evidence evidence = service.evidence(workspace.getId(), other.getId());

        assertThat(evidence.responses()).hasSize(1);
        assertThat(evidence.warnings()).hasSize(2);
        assertThat(evidence.responses().get(0).validationStepValue()).isEmpty();
        assertThat(evidence.responses().get(0).artifactValue()).isEmpty();
        assertThat(evidence.responses().get(0).checks().initialSubmissionSeen()).isFalse();
        assertThat(evidence.responses().get(0).checks().pdfUnchanged()).isNull();
        assertThat(evidence.responses().get(0).checks().overallPass()).isFalse();
    }

    private FormResponse revisedResponse(
        String studentNumber,
        String studentName,
        String teamCode,
        String subject,
        String email,
        String initialOption,
        String revisedOption,
        String initialPdf,
        String revisedPdf,
        String notes
    ) throws Exception {
        Instant initialAt = Instant.parse("2098-09-19T01:00:00Z");
        Map<String, Object> initialValues = Map.of(
            "validationStep", initialOption,
            "documentPdf", initialPdf,
            "notes", notes);
        FormResponse response = responses.saveAndFlush(new FormResponse(
            UUID.randomUUID(), workspace.getId(), deliverable.getId(), subject, email, UUID.randomUUID(),
            studentNumber, studentName, teamCode, objectMapper.writeValueAsString(initialValues), initialAt, initialAt));
        long initialRevision = response.getRevision();
        versions.saveAndFlush(new FormResponseVersion(
            UUID.randomUUID(), response, response.getValuesJson(), initialRevision, initialAt.plusSeconds(60)));

        Map<String, Object> currentValues = Map.of(
            "validationStep", revisedOption,
            "documentPdf", revisedPdf,
            "notes", notes);
        response.setValuesJson(objectMapper.writeValueAsString(currentValues));
        response.setUpdatedAt(initialAt.plusSeconds(120));
        return responses.saveAndFlush(response);
    }

    private FormResponse currentInitialResponse(
        String studentNumber,
        String studentName,
        String teamCode,
        String subject,
        String email,
        String initialOption,
        String pdf,
        String notes
    ) throws Exception {
        Instant now = Instant.parse("2098-09-19T02:00:00Z");
        return responses.saveAndFlush(new FormResponse(
            UUID.randomUUID(), workspace.getId(), deliverable.getId(), subject, email, UUID.randomUUID(),
            studentNumber, studentName, teamCode,
            objectMapper.writeValueAsString(Map.of("validationStep", initialOption, "documentPdf", pdf, "notes", notes)),
            now, now));
    }

    private Cookie sessionCookie(String subject, String email, StaffRole... roles) {
        Instant now = Instant.now();
        for (StaffRole role : roles) {
            staffRoles.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(), subject, email, role, true, now, now));
        }
        var session = sessions.create(new GoogleIdentity(subject, email, subject, ""));
        return new Cookie("WILDTRACK_SESSION", session.rawToken());
    }
}
