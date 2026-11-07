package com.capvault.backend.student;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import java.util.Map;
import java.time.LocalDateTime;
import com.capvault.backend.deliverable.*;
import com.capvault.backend.response.FormResponseService;
import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.GoogleIdentityService;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ValidationParticipantEntryTest {
    static final UUID VALIDATION = UUID.randomUUID();
    @DynamicPropertySource static void settings(DynamicPropertyRegistry registry) {
        registry.add("wildtrack.validation-entry.enabled", () -> true);
        registry.add("wildtrack.validation-entry.workspace-id", VALIDATION::toString);
    }

    @Autowired ValidationParticipantEntry entry;
    @Autowired StudentRecordRepository records;
    @Autowired CanonicalStudentAccountBindingRepository bindings;
    @Autowired WorkspaceStudentAssociationRepository legacy;
    @Autowired StudentAssociationService associations;
    @Autowired AcademicWorkspaceRepository workspaces;
    @Autowired WildTrackSessionService sessions;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entities;
    @Autowired MockMvc mvc;
    @Autowired FormResponseService submissions;
    @Autowired DeliverableRepository deliverables;
    @Autowired DeliverableFieldRepository fields;
    @MockBean GoogleIdentityService google;

    @BeforeEach void workspace() {
        if (!workspaces.existsById(VALIDATION)) jdbc.update("""
            INSERT INTO academic_workspaces(id, name, program, course_code, semester, academic_year, active, created_at, updated_at)
            VALUES (?, 'WildTrack Validation', 'Testing', ?, '1', '2026-27', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """, VALIDATION, "validation-" + VALIDATION);
    }

    private GoogleIdentity identity() {
        String id = UUID.randomUUID().toString();
        return new GoogleIdentity(id, "participant-" + id + "@example.test", "Participant Name", "");
    }
    private Cookie cookie(GoogleIdentity identity) {
        return new Cookie("WILDTRACK_SESSION", sessions.create(identity).rawToken());
    }

    @Test void newGoogleSignInCreatesOwnProfileWithoutClassDetails() throws Exception {
        var who = identity();
        when(google.authenticate(who.subject())).thenReturn(who);
        var login = mvc.perform(post("/api/auth/google/session").contentType("application/json")
                .content("{\"credential\":\"" + who.subject() + "\"}"))
            .andExpect(status().isOk()).andReturn();
        Cookie session = login.getResponse().getCookie("WILDTRACK_SESSION");
        var profile = associations.activeAssociation(VALIDATION, who.subject()).orElseThrow();
        assertThat(profile.studentNumber()).startsWith("ID-");
        assertThat(profile.studentName()).isEqualTo(who.name());
        mvc.perform(get("/api/workspaces").cookie(session)).andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(VALIDATION.toString()));
        mvc.perform(get("/api/auth/session").cookie(session)).andExpect(status().isOk())
            .andExpect(jsonPath("$.validationEntryAvailable").value(false));
        mvc.perform(post("/api/workspace/students/validation-entry").cookie(session).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.studentRecordId").value(profile.studentRecordId().toString()));
        assertThat(associations.activeAssociation(VALIDATION, who.subject()).orElseThrow().studentRecordId())
            .isEqualTo(profile.studentRecordId());
    }

    @Test void distinctPeopleAreNotTeammatesAndCannotReadClassRecords() throws Exception {
        var a = identity(); var b = identity();
        var first = entry.join(a.subject(), a.email(), a.name()).orElseThrow();
        var second = entry.join(b.subject(), b.email(), b.name()).orElseThrow();
        assertThat(first.studentNumber()).isNotEqualTo(second.studentNumber());
        assertThat(first.teamCode()).isNotEqualTo(second.teamCode());
        mvc.perform(get("/api/workspace/students/dashboard").param("workspaceId", VALIDATION.toString()).cookie(cookie(a)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.students.length()").value(1))
            .andExpect(jsonPath("$.students[0].studentNumber").value(first.studentNumber()));
        mvc.perform(get("/api/workspace/students/dashboard").param("workspaceId", AcademicWorkspace.DEFAULT_IT_ID.toString()).cookie(cookie(a)))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/workspace/students/options").param("workspaceId", VALIDATION.toString()).cookie(cookie(a)))
            .andExpect(status().isForbidden());
    }

    @Test void existingStudentKeepsTheClassConnection() {
        var who = identity();
        String number = "existing-" + UUID.randomUUID();
        var record = records.saveAndFlush(new StudentRecord(AcademicWorkspace.DEFAULT_IT_ID, number, "Class Student",
            "class-team", "1", null, null, who.email(), null));
        associations.connectDirectly(AcademicWorkspace.DEFAULT_IT_ID, who.subject(), who.email(), number);
        assertThat(entry.availableFor(who.subject())).isFalse();
        assertThat(entry.join(who.subject(), who.email(), who.name())).isEmpty();
        assertThat(associations.activeAssociation(AcademicWorkspace.DEFAULT_IT_ID, who.subject()).orElseThrow().studentRecordId())
            .isEqualTo(record.getId());
        assertThat(associations.activeAssociation(VALIDATION, who.subject())).isEmpty();
    }

    @Test void assignedProfileCanSaveAndReadBackItsPdfWithoutAnImportedRosterOrTrackerRow() {
        var who = identity();
        var profile = entry.join(who.subject(), who.email(), who.name()).orElseThrow();
        String suffix = UUID.randomUUID().toString();
        var form = deliverables.saveAndFlush(new Deliverable(VALIDATION, "STD-" + suffix, "STD Submission", "std-" + suffix,
            "Submit a PDF.", LocalDateTime.now().plusDays(30), true, DeliverableStatus.PUBLISHED));
        String pdfField = "pdf-" + suffix;
        fields.saveAndFlush(new DeliverableField(pdfField, form.getId(), "pdf", "PDF Drive Link", DeliverableFieldType.DRIVE_PDF,
            true, 0, DocumentCheckPolicy.OFF, true, true));
        String pdfLink = "https://drive.google.com/file/d/example-validation-pdf/view";
        var saved = submissions.submit(new FormResponseService.SubmitCommand(VALIDATION, form.getId(), who.subject(), who.email(),
            profile.studentNumber(), profile.studentName(), Map.of("pdf", pdfLink), null)).response();
        var readback = submissions.ownedResponse(VALIDATION, form.getId(), who.subject()).orElseThrow();
        assertThat(readback.getId()).isEqualTo(saved.getId());
        assertThat(readback.getStudentNumber()).isEqualTo(profile.studentNumber());
        assertThat(readback.getStudentName()).isEqualTo(who.name());
        assertThat(readback.getGoogleEmail()).isEqualTo(who.email());
        assertThat(readback.getTeamCode()).isEqualTo(profile.teamCode());
        assertThat(readback.getValuesJson()).contains(pdfLink);
        assertThat(submissions.ownedResponse(VALIDATION, form.getId(), identity().subject())).isEmpty();
    }

    @Test void existingUnlinkedSessionCanEnterButAnonymousAndCsrfLessRequestsCannot() throws Exception {
        var who = identity(); var session = cookie(who);
        mvc.perform(get("/api/auth/session").cookie(session)).andExpect(status().isOk())
            .andExpect(jsonPath("$.validationEntryAvailable").value(true));
        mvc.perform(post("/api/workspace/students/validation-entry").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/workspace/students/validation-entry").cookie(session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/workspace/students/validation-entry").cookie(session).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.workspaceId").value(VALIDATION.toString()));
    }

    @Test void turningEntryOffCreatesNoProfile() {
        var who = identity();
        var closed = new ValidationParticipantEntry(false, VALIDATION.toString(), entities, records, bindings, legacy, associations);
        assertThat(closed.availableFor(who.subject())).isFalse();
        assertThat(closed.join(who.subject(), who.email(), who.name())).isEmpty();
        assertThat(associations.activeAssociation(VALIDATION, who.subject())).isEmpty();
    }
}
