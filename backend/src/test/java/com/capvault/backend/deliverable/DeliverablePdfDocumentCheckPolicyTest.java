package com.capvault.backend.deliverable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.capvault.backend.workspace.AcademicWorkspace;
import com.capvault.backend.workspace.AcademicWorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DeliverablePdfDocumentCheckPolicyTest {
    @Autowired private DeliverableService service;
    @Autowired private AcademicWorkspaceRepository workspaces;
    @Autowired private DeliverableFieldRepository fields;
    @Autowired private DeliverableRepository deliverables;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataSource dataSource;
    @Autowired private EntityManager entityManager;

    @Test
    void createAndExplicitUpdateNormalizePdfOffAndManualEvenWhenInactive() {
        UUID workspaceId = workspace();
        var created = service.createDeliverable(workspaceId, request(List.of(
            field(null, "firstPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.OFF, false, true),
            field(null, "secondPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.MANUAL, true, false),
            field(null, "otherLink", DeliverableFieldType.GENERAL_URL, DocumentCheckPolicy.OFF, false, true)
        )));
        var createdByKey = byKey(created);
        assertThat(createdByKey.get("firstPdf").documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.AUTO);
        assertThat(createdByKey.get("secondPdf").documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.AUTO);
        assertThat(createdByKey.get("secondPdf").active()).isFalse();
        assertThat(createdByKey.get("secondPdf").aiReviewEnabled()).isTrue();
        assertThat(createdByKey.get("otherLink").documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.OFF);

        var updated = service.updateDeliverable(workspaceId, created.id(), request(List.of(
            field(createdByKey.get("firstPdf").id(), "firstPdf", DeliverableFieldType.DRIVE_PDF,
                DocumentCheckPolicy.MANUAL, false, true),
            field(createdByKey.get("secondPdf").id(), "secondPdf", DeliverableFieldType.DRIVE_PDF,
                DocumentCheckPolicy.OFF, true, true),
            field(createdByKey.get("otherLink").id(), "otherLink", DeliverableFieldType.GENERAL_URL,
                DocumentCheckPolicy.OFF, false, true)
        )));
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::id)
            .containsExactlyElementsOf(created.fields().stream().map(DeliverableFieldResponse::id).toList());
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::documentCheckPolicy)
            .containsExactly(DocumentCheckPolicy.AUTO, DocumentCheckPolicy.AUTO, DocumentCheckPolicy.OFF);
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::active)
            .containsExactly(true, true, true);
        assertThat(fields.findById(createdByKey.get("firstPdf").id()).orElseThrow().getDocumentCheckPolicy())
            .isEqualTo(DocumentCheckPolicy.AUTO);
    }

    @Test
    void legacyFieldlessUpdateRepairsStoredPoliciesWithoutReplacingAnyFieldConfiguration() {
        UUID workspaceId = workspace();
        var created = service.createDeliverable(workspaceId, request(List.of(
            field(null, "firstPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, true, true),
            field(null, "secondPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, false, false),
            field(null, "choice", DeliverableFieldType.SHORT_TEXT, DocumentCheckPolicy.OFF, false, true)
        )));
        var ids = byKey(created);
        corrupt(ids.get("firstPdf").id(), "OFF");
        corrupt(ids.get("secondPdf").id(), "MANUAL");
        corrupt(ids.get("choice").id(), "AUTO");
        entityManager.clear();

        // An older backend client supplies no field definitions on PUT. Existing
        // keys, IDs, active flags, optionality and AI settings must be retained.
        var updated = service.updateDeliverable(workspaceId, created.id(), legacyRequest(true));
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::fieldKey)
            .containsExactly("firstPdf", "secondPdf", "choice");
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::id)
            .containsExactlyElementsOf(created.fields().stream().map(DeliverableFieldResponse::id).toList());
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::documentCheckPolicy)
            .containsExactly(DocumentCheckPolicy.AUTO, DocumentCheckPolicy.AUTO, DocumentCheckPolicy.OFF);
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::active)
            .containsExactly(true, false, true);
        assertThat(updated.fields()).extracting(DeliverableFieldResponse::aiReviewEnabled)
            .containsExactly(true, false, false);
        assertThat(updated.pdfRequired()).isTrue();
    }

    @Test
    void removingLegacyOffPdfFieldKeepsInactiveRecordButNormalizesItsPolicy() {
        UUID workspaceId = workspace();
        var created = service.createDeliverable(workspaceId, request(List.of(
            field(null, "removedPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, true, true),
            field(null, "retainedPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, false, true)
        )));
        var byKey = byKey(created);
        corrupt(byKey.get("removedPdf").id(), "OFF");
        entityManager.clear();

        var updated = service.updateDeliverable(workspaceId, created.id(), request(List.of(
            field(byKey.get("retainedPdf").id(), "retainedPdf", DeliverableFieldType.DRIVE_PDF,
                DocumentCheckPolicy.MANUAL, false, true)
        )));
        assertThat(updated.fields()).hasSize(2);
        var removed = fields.findById(byKey.get("removedPdf").id()).orElseThrow();
        assertThat(removed.isActive()).isFalse();
        assertThat(removed.getDocumentCheckPolicy()).isEqualTo(DocumentCheckPolicy.AUTO);
        assertThat(removed.isAiReviewEnabled()).isTrue();
        assertThat(fields.findById(byKey.get("retainedPdf").id()).orElseThrow().getDocumentCheckPolicy())
            .isEqualTo(DocumentCheckPolicy.AUTO);
    }

    @Test
    void legacyCreateUsesAutoForPdfAndOffForNonPdf() {
        UUID workspaceId = workspace();
        var pdf = service.createDeliverable(workspaceId, legacyRequest(true));
        assertThat(pdf.fields()).singleElement().satisfies(item -> {
            assertThat(item.fieldType()).isEqualTo(DeliverableFieldType.DRIVE_PDF);
            assertThat(item.documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.AUTO);
        });
        var link = service.createDeliverable(workspaceId,
            new DeliverableRequest("LINK", "Link", "legacy-link", "", LocalDateTime.of(2099, 2, 1, 0, 0),
                false, DeliverableStatus.PUBLISHED, null));
        assertThat(link.fields()).singleElement().satisfies(item -> {
            assertThat(item.fieldType()).isEqualTo(DeliverableFieldType.GENERAL_URL);
            assertThat(item.documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.OFF);
        });
    }

    @Test
    void rejectsInvalidNonPdfPolicyEvenWhenRequestIncludesValidPdfFields() {
        UUID workspaceId = workspace();
        for (DocumentCheckPolicy invalid : List.of(DocumentCheckPolicy.AUTO, DocumentCheckPolicy.MANUAL)) {
            assertThatThrownBy(() -> service.createDeliverable(workspaceId, request(List.of(
                field(null, "firstPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.OFF, false, true),
                field(null, "otherLink", DeliverableFieldType.GENERAL_URL, invalid, false, true)
            )))).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("only available for Google Drive PDF");
        }
        assertThat(deliverables.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId)).isEmpty();
    }

    @Test
    void fieldTypeConversionBeforeAnySubmissionUsesOnlyItsNewTypePolicy() {
        UUID workspaceId = workspace();
        var created = service.createDeliverable(workspaceId, request(List.of(
            field(null, "attachment", DeliverableFieldType.GENERAL_URL, DocumentCheckPolicy.OFF, false, true)
        )));
        String id = created.fields().get(0).id();
        var convertedToPdf = service.updateDeliverable(workspaceId, created.id(), request(List.of(
            field(id, "attachment", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.OFF, false, true)
        )));
        assertThat(convertedToPdf.fields().get(0).documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.AUTO);
        var convertedToLink = service.updateDeliverable(workspaceId, created.id(), request(List.of(
            field(id, "attachment", DeliverableFieldType.GENERAL_URL, DocumentCheckPolicy.OFF, false, true)
        )));
        assertThat(convertedToLink.fields().get(0).documentCheckPolicy()).isEqualTo(DocumentCheckPolicy.OFF);
        assertThat(convertedToLink.pdfRequired()).isFalse();
        assertThat(convertedToLink.fields().get(0).id()).isEqualTo(id);
    }

    @Test
    void migrationRepairsBothActiveAndInactivePdfAndOnlyInvalidNonPdfPoliciesWithoutChangingOtherData() {
        UUID workspaceId = workspace();
        var created = service.createDeliverable(workspaceId, request(List.of(
            field(null, "activePdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, false, true),
            field(null, "inactivePdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, true, false),
            field(null, "validPdf", DeliverableFieldType.DRIVE_PDF, DocumentCheckPolicy.AUTO, true, true),
            field(null, "wrongLink", DeliverableFieldType.GENERAL_URL, DocumentCheckPolicy.OFF, false, true),
            field(null, "validLink", DeliverableFieldType.GOOGLE_FORM, DocumentCheckPolicy.OFF, false, false)
        )));
        var byKey = byKey(created);
        corrupt(byKey.get("activePdf").id(), "OFF");
        corrupt(byKey.get("inactivePdf").id(), "MANUAL");
        corrupt(byKey.get("wrongLink").id(), "MANUAL");

        Map<String, List<?>> before = snapshot(created.id());
        runMigration();
        assertThat(policy(byKey.get("activePdf").id())).isEqualTo("AUTO");
        assertThat(policy(byKey.get("inactivePdf").id())).isEqualTo("AUTO");
        assertThat(policy(byKey.get("validPdf").id())).isEqualTo("AUTO");
        assertThat(policy(byKey.get("wrongLink").id())).isEqualTo("OFF");
        assertThat(policy(byKey.get("validLink").id())).isEqualTo("OFF");
        assertThat(snapshot(created.id())).isEqualTo(before);

        // Idempotence matters when operators replay the migration against a
        // restored snapshot. Existing evidence and timestamps stay untouched.
        runMigration();
        assertThat(snapshot(created.id())).isEqualTo(before);
    }

    private Map<String, DeliverableFieldResponse> byKey(DeliverableResponse result) {
        return result.fields().stream().collect(Collectors.toMap(DeliverableFieldResponse::fieldKey, item -> item));
    }

    private UUID workspace() {
        return workspaces.save(new AcademicWorkspace("PDF policy", "IT", "IT411", "Semester 1",
            "2099-11", true)).getId();
    }

    private DeliverableRequest request(List<DeliverableFieldRequest> definitions) {
        return new DeliverableRequest("SRS", "SRS", "srs-pdf-check-policy", "Review the attached PDF.",
            LocalDateTime.of(2099, 1, 31, 23, 59), true, DeliverableStatus.PUBLISHED, definitions);
    }

    private DeliverableRequest legacyRequest(boolean pdfRequired) {
        return new DeliverableRequest("SRS", "SRS", "srs-pdf-check-policy", "Review the attached PDF.",
            LocalDateTime.of(2099, 1, 31, 23, 59), pdfRequired, DeliverableStatus.PUBLISHED, null);
    }

    private DeliverableFieldRequest field(String id, String key, DeliverableFieldType type,
            DocumentCheckPolicy policy, boolean aiReview, boolean active) {
        return new DeliverableFieldRequest(id, key, key, type, true, 0, policy, aiReview, active);
    }

    private void corrupt(String id, String policy) {
        jdbc.update("UPDATE academic_deliverable_fields SET document_check_policy=? WHERE id=?", policy, id);
    }

    private String policy(String id) {
        return jdbc.queryForObject("SELECT document_check_policy FROM academic_deliverable_fields WHERE id=?",
            String.class, id);
    }

    private Map<String, List<?>> snapshot(UUID deliverableId) {
        return Map.of(
            "fields", jdbc.query("""
                SELECT id, field_key, label, field_type, required, display_order,
                       ai_review_enabled, active, created_at, updated_at
                FROM academic_deliverable_fields WHERE deliverable_id=? ORDER BY field_key
                """, (rs, row) -> List.of(rs.getString("id"), rs.getString("field_key"), rs.getString("label"),
                    rs.getString("field_type"), rs.getBoolean("required"), rs.getInt("display_order"),
                    rs.getBoolean("ai_review_enabled"), rs.getBoolean("active"),
                    rs.getTimestamp("created_at"), rs.getTimestamp("updated_at")), deliverableId),
            "deliverable", jdbc.query("""
                SELECT pdf_required, status, due_at, created_at, updated_at
                FROM academic_deliverables WHERE id=?
                """, (rs, row) -> List.of(rs.getBoolean("pdf_required"), rs.getString("status"),
                    rs.getTimestamp("due_at"), rs.getTimestamp("created_at"), rs.getTimestamp("updated_at")), deliverableId)
        );
    }

    private void runMigration() {
        Connection connection = DataSourceUtils.getConnection(dataSource);
        try {
            ScriptUtils.executeSqlScript(connection,
                new ClassPathResource("db/migration/V28__pdf_document_check_always_enabled.sql"));
        } finally {
            DataSourceUtils.releaseConnection(connection, dataSource);
        }
    }
}
