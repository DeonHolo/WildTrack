package com.capvault.backend.template;

import static org.assertj.core.api.Assertions.*;
import static com.capvault.backend.support.AuthenticatedRequest.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

    private TemplateInstructionProtocol.Draft item(String title, int page, String condition) {
        return new TemplateInstructionProtocol.Draft(title, "Instruction", "Quote", "", page,
            TemplateInstructionProtocol.Applicability.REQUIRED, condition);
    }
    private UUID upload(String value) throws Exception {
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
            UUID id = templates.save(WORKSPACE, key, "Template",
                new MockMultipartFile("file", "source.pdf", "application/pdf", bytes.toByteArray())).id();
            for (int attempts = 0; attempts < 20 && !"READY".equals(pdfs.current(WORKSPACE, id).state()); attempts++)
                pdfPreparation.prepareNext();
            assertThat(pdfs.current(WORKSPACE, id).state()).isEqualTo("READY");
            return id;
        }
    }
}
