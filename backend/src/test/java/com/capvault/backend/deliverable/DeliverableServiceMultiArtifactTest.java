package com.capvault.backend.deliverable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DeliverableServiceMultiArtifactTest {

    @Autowired private DeliverableService service;
    @Autowired private AcademicWorkspaceRepository workspaceRepository;
    @Autowired private FormResponseRepository responseRepository;

    @Test
    void createsAndUpdatesFiveStableTypedFieldsWithoutChangingTheirIdentity() {
        var workspace = workspaceRepository.save(new AcademicWorkspace(
            "MVP field test", "IT", "IT411", "Semester 1", "2099-01", true));
        var created = service.createDeliverable(workspace.getId(), request(List.of(
            field(null, "validationInstrument", "Validation Instrument", DeliverableFieldType.GOOGLE_FORM, DocumentCheckPolicy.OFF, false),
            field(null, "frameworkModel", "Framework / Model", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.MANUAL, true),
            field(null, "responseSheet", "Validation Response Sheet", DeliverableFieldType.GOOGLE_SHEET, DocumentCheckPolicy.OFF, false),
            field(null, "validationHighlights", "MVP Validation Highlights", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, true),
            field(null, "validationEvidence", "Validation Evidence", DeliverableFieldType.DRIVE_FOLDER, DocumentCheckPolicy.OFF, false)
        )));

        assertThat(created.fields()).hasSize(5);
        assertThat(created.fields()).extracting(DeliverableFieldResponse::fieldKey)
            .containsExactly("validationInstrument", "frameworkModel", "responseSheet", "validationHighlights", "validationEvidence");
        assertThat(created.fields()).extracting(DeliverableFieldResponse::fieldType)
            .containsExactly(DeliverableFieldType.GOOGLE_FORM, DeliverableFieldType.DRIVE_PDF,
                DeliverableFieldType.GOOGLE_SHEET, DeliverableFieldType.DRIVE_PDF, DeliverableFieldType.DRIVE_FOLDER);
        assertThat(created.pdfRequired()).isTrue();

        var idsByKey = created.fields().stream().collect(java.util.stream.Collectors.toMap(
            DeliverableFieldResponse::fieldKey, DeliverableFieldResponse::id));
        List<DeliverableFieldRequest> reordered = List.of(
            field(idsByKey.get("validationHighlights"), "validationHighlights", "MVP Validation Highlights PDF", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, true),
            field(idsByKey.get("frameworkModel"), "frameworkModel", "Framework / Model PDF", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.MANUAL, true),
            field(idsByKey.get("validationInstrument"), "validationInstrument", "Validation Instrument", DeliverableFieldType.GOOGLE_FORM, DocumentCheckPolicy.OFF, false),
            field(idsByKey.get("responseSheet"), "responseSheet", "Validation Response Sheet", DeliverableFieldType.GOOGLE_SHEET, DocumentCheckPolicy.OFF, false),
            field(idsByKey.get("validationEvidence"), "validationEvidence", "Validation Evidence", DeliverableFieldType.DRIVE_FOLDER, DocumentCheckPolicy.OFF, false)
        );
        var updated = service.updateDeliverable(workspace.getId(), created.id(), request(reordered));

        assertThat(updated.fields()).extracting(DeliverableFieldResponse::fieldKey)
            .containsExactly("validationHighlights", "frameworkModel", "validationInstrument", "responseSheet", "validationEvidence");
        assertThat(updated.fields()).allSatisfy(field -> assertThat(field.id()).isEqualTo(idsByKey.get(field.fieldKey())));
    }

    @Test
    void rejectsUnknownClientFieldIdentityInsteadOfCreatingOrCrossAssociatingIt() {
        var workspace = workspaceRepository.save(new AcademicWorkspace(
            "Field identity test", "IT", "IT411", "Semester 1", "2099-01", true));
        var created = service.createDeliverable(workspace.getId(), request(List.of(
            field(null, "frameworkModel", "Framework / Model", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.MANUAL, true)
        )));

        assertThatThrownBy(() -> service.updateDeliverable(workspace.getId(), created.id(), request(List.of(
            field("not-owned-by-this-deliverable", "frameworkModel", "Framework / Model", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.MANUAL, true)
        ))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("does not belong to this deliverable");
    }

    @Test
    void persistsHelpTextAndStableChoiceOptionsAndAllowsAdditiveOptionsAfterResponses() {
        var workspace = workspaceRepository.save(new AcademicWorkspace(
            "Question config", "IT", "IT411", "Semester 1", "2099-02", true));
        var created = service.createDeliverable(workspace.getId(), request(List.of(
            configuredField(null, "statusReason", "Status reason", "Choose one.", DeliverableFieldType.DROPDOWN,
                DocumentCheckPolicy.OFF, false, List.of(
                    option("draft-local-a", "Needs revision"),
                    option(null, "Ready")
                ))
        )));
        var field = created.fields().get(0);
        assertThat(field.helpText()).isEqualTo("Choose one.");
        assertThat(field.options()).hasSize(2);
        assertThat(field.options()).allSatisfy(option -> assertThat(option.id()).isNotBlank());
        assertThat(field.options()).extracting(DeliverableFieldOptionResponse::id)
            .doesNotContain("draft-local-a");

        responseRepository.save(new FormResponse(
            UUID.randomUUID(), workspace.getId(), created.id(), "subject", "subject@example.com",
            UUID.randomUUID(), "2026-001", "Student", "TEAM-1", "{}", Instant.now(), Instant.now()));

        var existingOptions = field.options();
        var updated = service.updateDeliverable(workspace.getId(), created.id(),
            request(List.of(configuredField(field.id(), "statusReason", "Status reason", "Choose one.",
                DeliverableFieldType.DROPDOWN, DocumentCheckPolicy.OFF, false, List.of(
                    option(existingOptions.get(1).id(), existingOptions.get(1).label()),
                    option(existingOptions.get(0).id(), existingOptions.get(0).label()),
                    option("local-new-option", "Waiting for adviser")
                )))));

        assertThat(updated.fields().get(0).id()).isEqualTo(field.id());
        assertThat(updated.fields().get(0).options()).extracting(DeliverableFieldOptionResponse::label)
            .containsExactly("Ready", "Needs revision", "Waiting for adviser");
        assertThat(updated.fields().get(0).options().subList(0, 2))
            .extracting(DeliverableFieldOptionResponse::id)
            .containsExactly(existingOptions.get(1).id(), existingOptions.get(0).id());
    }

    @Test
    void responsesFreezeExistingFieldTypeAndChoiceMeaning() {
        var workspace = workspaceRepository.save(new AcademicWorkspace(
            "Compatibility", "IT", "IT411", "Semester 1", "2099-03", true));
        var created = service.createDeliverable(workspace.getId(), request(List.of(
            configuredField(null, "decision", "Decision", null, DeliverableFieldType.MULTIPLE_CHOICE,
                DocumentCheckPolicy.OFF, false, List.of(option(null, "Accept"), option(null, "Revise")))
        )));
        var field = created.fields().get(0);
        responseRepository.save(new FormResponse(
            UUID.randomUUID(), workspace.getId(), created.id(), "subject", "subject@example.com",
            UUID.randomUUID(), "2026-002", "Student", "TEAM-2", "{}", Instant.now(), Instant.now()));

        assertThatThrownBy(() -> service.updateDeliverable(workspace.getId(), created.id(), request(List.of(
            configuredField(field.id(), "decision", "Decision", null, DeliverableFieldType.SHORT_TEXT,
                DocumentCheckPolicy.OFF, false, List.of())
        ))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("type cannot be changed");

        assertThatThrownBy(() -> service.updateDeliverable(workspace.getId(), created.id(), request(List.of(
            configuredField(field.id(), "decision", "Decision", null, DeliverableFieldType.MULTIPLE_CHOICE,
                DocumentCheckPolicy.OFF, false, List.of(
                    option(field.options().get(0).id(), "Accepted"),
                    option(field.options().get(1).id(), field.options().get(1).label())
                ))
        ))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("IDs and labels cannot be removed or changed");
    }

    @Test
    void rejectsInvalidChoiceAndPdfOnlyConfiguration() {
        var workspace = workspaceRepository.save(new AcademicWorkspace(
            "Validation", "IT", "IT411", "Semester 1", "2099-04", true));

        assertThatThrownBy(() -> service.createDeliverable(workspace.getId(), request(List.of(
            configuredField(null, "text", "Text", null, DeliverableFieldType.SHORT_TEXT,
                DocumentCheckPolicy.AUTO, false, List.of())
        ))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("only available for Google Drive PDF");

        assertThatThrownBy(() -> service.createDeliverable(workspace.getId(), request(List.of(
            configuredField(null, "text", "Text", null, DeliverableFieldType.SHORT_TEXT,
                DocumentCheckPolicy.OFF, true, List.of())
        ))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("AI Review is only available for Google Drive PDF");

        assertThatThrownBy(() -> service.createDeliverable(workspace.getId(), request(List.of(
            configuredField(null, "pick", "Pick", null, DeliverableFieldType.DROPDOWN,
                DocumentCheckPolicy.OFF, false, List.of(option(null, "Same"), option(null, " same ")))
        ))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("labels must be unique");

        assertThatThrownBy(() -> service.createDeliverable(workspace.getId(), request(List.of(
            configuredField(null, "text", "Text", null, DeliverableFieldType.SHORT_TEXT,
                DocumentCheckPolicy.OFF, false, List.of(option(null, "Not allowed")))
        ))))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("only allowed");

        var aiOnlyWorkspace = workspaceRepository.save(new AcademicWorkspace(
            "Independent PDF review", "IT", "IT411", "Semester 1", "2099-05", true));
        var aiOnly = service.createDeliverable(aiOnlyWorkspace.getId(), request(List.of(
            configuredField(null, "pdf", "PDF", null, DeliverableFieldType.DRIVE_PDF,
                DocumentCheckPolicy.OFF, true, List.of())
        )));
        assertThat(aiOnly.fields()).singleElement().satisfies(field -> {
            assertThat(field.documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.OFF);
            assertThat(field.aiReviewEnabled()).isTrue();
        });
    }

    private DeliverableRequest request(List<DeliverableFieldRequest> fields) {
        return new DeliverableRequest(
            "MVP Validation", "MVP Validation", "mvp-validation-test", "Submit validation artifacts.",
            LocalDateTime.of(2099, 1, 31, 23, 59), true, DeliverableStatus.PUBLISHED, fields
        );
    }

    private DeliverableFieldRequest field(String id, String key, String label, DeliverableFieldType type,
            DocumentCheckPolicy policy, boolean ai) {
        return new DeliverableFieldRequest(id, key, label, type, true, 0, policy, ai, true);
    }

    private DeliverableFieldRequest configuredField(String id, String key, String label, String helpText,
            DeliverableFieldType type, DocumentCheckPolicy policy, boolean ai,
            List<DeliverableFieldOptionRequest> options) {
        return new DeliverableFieldRequest(id, key, label, helpText, type, true, 0, policy, ai, true, options);
    }

    private DeliverableFieldOptionRequest option(String id, String label) {
        return new DeliverableFieldOptionRequest(id, label);
    }
}
