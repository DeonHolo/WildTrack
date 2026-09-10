package com.capvault.backend.deliverable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.util.List;

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
}
