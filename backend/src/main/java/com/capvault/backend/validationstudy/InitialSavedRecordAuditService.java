package com.capvault.backend.validationstudy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseVersion;
import com.capvault.backend.response.FormResponseVersionRepository;
import com.capvault.backend.student.CanonicalStudentAccountBinding;
import com.capvault.backend.student.CanonicalStudentAccountBindingRepository;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;
import com.capvault.backend.student.WorkspaceStudentAssociation;
import com.capvault.backend.student.WorkspaceStudentAssociationRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

@Service
public class InitialSavedRecordAuditService {

    private static final String SCOPE = "INITIAL_SAVED_RECORD_SYSTEM_AUDIT_V1";
    private static final String ORIGINAL_CURRENT = "CURRENT_REVISION_1";
    private static final String ORIGINAL_HISTORY = "HISTORY_REVISION_1";
    private static final String ORIGINAL_UNKNOWN = "UNVERIFIED";

    private final FormResponseVersionRepository versions;
    private final StudentRecordRepository students;
    private final WorkspaceStudentAssociationRepository associations;
    private final CanonicalStudentAccountBindingRepository canonicalBindings;
    private final ObjectMapper objectMapper;

    public InitialSavedRecordAuditService(
        FormResponseVersionRepository versions,
        StudentRecordRepository students,
        WorkspaceStudentAssociationRepository associations,
        CanonicalStudentAccountBindingRepository canonicalBindings,
        ObjectMapper objectMapper
    ) {
        this.versions = versions;
        this.students = students;
        this.associations = associations;
        this.canonicalBindings = canonicalBindings;
        this.objectMapper = objectMapper;
    }

    public ValidationStudyService.InitialSavedRecords audit(
        UUID workspaceId,
        UUID deliverableId,
        Deliverable deliverable,
        List<DeliverableField> fields,
        List<FormResponse> responses
    ) {
        DeliverableField artifactField = findArtifactField(fields);
        List<DeliverableField> requiredFields = fields.stream()
            .filter(DeliverableField::isActive)
            .filter(DeliverableField::isRequired)
            .toList();

        Map<String, List<FormResponse>> grouped = new LinkedHashMap<>();
        for (FormResponse response : responses) {
String studentKey = normalizeStudentNumber(response.getStudentNumber());
            if (studentKey.isBlank()) studentKey = "__UNKNOWN__" + response.getId();
            grouped.computeIfAbsent(studentKey, ignored -> new ArrayList<>()).add(response);
        }
        List<Candidate> candidates = new ArrayList<>();
        for (List<FormResponse> group : grouped.values()) {
            group.stream().map(response -> candidate(response, workspaceId, deliverableId, deliverable, fields, requiredFields, artifactField))
                .min(Comparator.comparing(Candidate::sortAt).thenComparing(item -> item.response().getId()))
                .ifPresent(candidates::add);
        }
candidates.sort(Comparator.comparing(item -> normalizeStudentNumber(item.response().getStudentNumber())));
        List<ValidationStudyService.InitialSavedRecord> records = candidates.stream().map(Candidate::record).toList();

        long passed = records.stream().filter(item -> "PASS".equals(item.overallStatus())).count();
        long failed = records.stream().filter(item -> "FAIL".equals(item.overallStatus())).count();
        long unverified = records.size() - passed - failed;
        Double agreement = records.isEmpty() ? null : (double) passed / records.size();
        String outcome = records.isEmpty() || unverified > 0 ? "INCONCLUSIVE" : agreement >= .95 ? "PASS" : "BELOW_TARGET";
        return new ValidationStudyService.InitialSavedRecords(
            SCOPE, Instant.now(), workspaceId, deliverableId, responses.size(), records.size(), (int) passed,
            (int) failed, (int) unverified, agreement, outcome,
            "One earliest original timestamp per normalized student number; submittedAt fallback, then response ID tie-break.",
            records,
            List.of(
                "Current field definitions are not versioned; required-field assessment uses the active definitions at audit time.",
                "Account and identity metadata are not versioned; exact pre-save input, readback, consent and PDF MIME/content are not inferred."
            )
        );
    }

    private Candidate candidate(
        FormResponse response, UUID workspaceId, UUID deliverableId, Deliverable deliverable,
        List<DeliverableField> fields, List<DeliverableField> requiredFields, DeliverableField artifactField
    ) {
        Map<String, Object> current = readValues(response.getValuesJson());
        List<FormResponseVersion> history = versions.findAllByResponseIdOrderByRevisionAsc(response.getId());
        FormResponseVersion revisionOne = history.stream().filter(item -> item.getRevision() == 1L).findFirst().orElse(null);
        boolean currentIsOriginal = response.getRevision() == 1L;
        Map<String, Object> originalValues = currentIsOriginal ? current : revisionOne == null ? Map.of() : readValues(revisionOne.getValuesJson());
        String source = currentIsOriginal ? ORIGINAL_CURRENT : revisionOne != null ? ORIGINAL_HISTORY : ORIGINAL_UNKNOWN;
Instant originalSavedAt = currentIsOriginal || revisionOne != null ? response.getSubmittedAt() : null;
        Long originalRevision = currentIsOriginal || revisionOne != null ? 1L : null;

        StudentRecord roster = resolveRoster(response, workspaceId);
        ValidationStudyService.AuditCheck studentDetails = studentDetails(response, roster, originalValues);
        ValidationStudyService.AuditCheck workspace = response.getWorkspaceId().equals(workspaceId)
            ? pass("Response belongs to the selected workspace.") : fail("Response workspace does not match the selected workspace.");
        ValidationStudyService.AuditCheck deliverableCheck = response.getDeliverableId().equals(deliverableId)
            ? pass("Response belongs to the selected validation deliverable.") : fail("Response deliverable does not match the selected deliverable.");
        ValidationStudyService.AuditCheck originalVersion = originalRevision == null
            ? unver("No persisted original revision 1 is available.") : pass("Persisted original revision 1 is available.");
        List<String> missing = new ArrayList<>();
for (DeliverableField field : requiredFields) {
if (!hasUsableValue(field, originalValues.get(field.getFieldKey()))) missing.add(field.getFieldKey());
        }
        if (artifactField == null) missing.add("<configured-pdf-or-link-field>");
        else if (!hasUsableValue(artifactField, originalValues.get(artifactField.getFieldKey()))) missing.add(artifactField.getFieldKey());
        List<String> checkedFields = new ArrayList<>(requiredFields.stream().map(DeliverableField::getFieldKey).toList());
        if (artifactField != null && !checkedFields.contains(artifactField.getFieldKey())) checkedFields.add(artifactField.getFieldKey());
        ValidationStudyService.AuditCheck storedValues = originalRevision == null
            ? unver("Original stored values cannot be assessed without persisted revision 1.")
            : missing.isEmpty()
            ? pass("Required active field values and configured PDF/link value are present in the original record.")
            : fail("Missing required original stored field values: " + String.join(", ", missing));
        ValidationStudyService.AuditCheck accountBinding = accountBinding(response, workspaceId, roster);
        String overall = List.of(studentDetails, workspace, deliverableCheck, originalVersion, storedValues, accountBinding).stream()
            .anyMatch(item -> "FAIL".equals(item.status())) ? "FAIL"
            : List.of(studentDetails, workspace, deliverableCheck, originalVersion, storedValues, accountBinding).stream()
.anyMatch(item -> "UNVERIFIED".equals(item.status())) || "UNVERIFIED".equals(accountBinding.status()) ? "UNVERIFIED" : "PASS";

        ValidationStudyService.InitialSavedRecord record = new ValidationStudyService.InitialSavedRecord(
            response.getId(), response.getStudentNumber(), response.getStudentName(), response.getTeamCode(), response.getStudentRecordId(),
            response.getWorkspaceId(), response.getDeliverableId(), source, originalRevision, originalSavedAt,
            stringValue(originalValues.get(artifactField == null ? null : artifactField.getFieldKey())),
            roster == null ? null : roster.getStudentNumber(), roster == null ? null : roster.getStudentName(), roster == null ? null : roster.getTeamCode(),
            studentDetails, workspace, deliverableCheck, originalVersion, storedValues, accountBinding,
            checkedFields, missing, overall
        );
return new Candidate(response, response.getSubmittedAt(), record);
    }

    private StudentRecord resolveRoster(FormResponse response, UUID workspaceId) {
        if (response.getStudentRecordId() != null) {
            StudentRecord byId = students.findById(response.getStudentRecordId()).orElse(null);
            if (byId != null && workspaceId.equals(byId.getWorkspaceId())) return byId;
            return null;
        }
        List<StudentRecord> matches = students.findAllByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, response.getStudentNumber());
        return matches.size() == 1 ? matches.get(0) : null;
    }

    private ValidationStudyService.AuditCheck studentDetails(FormResponse response, StudentRecord roster, Map<String, Object> originalValues) {
        if (roster == null) return response.getStudentRecordId() == null
            ? unver("No unique canonical roster record was found in the selected workspace.")
            : fail("Persisted student record ID is missing or belongs to another workspace.");
        if (!same(response.getStudentNumber(), roster.getStudentNumber())
            || !same(response.getStudentName(), roster.getStudentName())
            || !same(response.getTeamCode(), roster.getTeamCode())) {
            return fail("Persisted student identity metadata contradicts the canonical roster.");
        }
        if (contradicts(originalValues, "studentnumber", roster.getStudentNumber())
            || contradicts(originalValues, "studentname", roster.getStudentName())
            || contradicts(originalValues, "teamcode", roster.getTeamCode())) {
            return fail("Original stored identity fields contradict the canonical roster.");
        }
        return pass("Persisted student identity metadata matches the canonical roster.");
    }

    private static boolean contradicts(Map<String, Object> values, String expectedKey, String expectedValue) {
        for (Map.Entry<String, Object> entry : values.entrySet()) {
            String key = normalize(entry.getKey());
            if ((key.equals(expectedKey) || key.endsWith(expectedKey)) && !same(stringValue(entry.getValue()), expectedValue)) return true;
        }
        return false;
    }

    private ValidationStudyService.AuditCheck accountBinding(FormResponse response, UUID workspaceId, StudentRecord roster) {
        if (roster == null || response.getGoogleSubject() == null || response.getGoogleSubject().isBlank()) {
            return unver("No authoritative active workspace or verified legacy account binding is available.");
        }
        List<WorkspaceStudentAssociation> allAssociations = associations.findAllByStudentNumberIgnoreCaseOrderByUpdatedAtDesc(roster.getStudentNumber());
        List<WorkspaceStudentAssociation> activeWorkspace = allAssociations.stream()
            .filter(item -> workspaceId.equals(item.getWorkspaceId()) && item.isActive()).toList();
        boolean active = activeWorkspace.stream()
            .anyMatch(item -> roster.getId().equals(item.getStudentRecordId()) && response.getGoogleSubject().equals(item.getGoogleSubject()));
        if (active) return pass("Response subject matches the active workspace student association.");
        if (!activeWorkspace.isEmpty()) return fail("Response subject conflicts with the active workspace student association.");
        CanonicalStudentAccountBinding legacy = canonicalBindings.findById(normalizeStudentNumber(roster.getStudentNumber())).orElse(null);
        if (legacy != null && legacy.isBound() && response.getGoogleSubject().equals(legacy.getGoogleSubject())) {
            return pass("Response subject matches the verified canonical legacy account binding.");
        }
        return legacy != null && legacy.isBound()
            ? fail("Response subject conflicts with the authoritative student account binding.")
            : unver("No authoritative active workspace or verified legacy account binding is available.");
    }

    private DeliverableField findArtifactField(List<DeliverableField> fields) {
        return fields.stream().filter(DeliverableField::isActive).filter(item -> item.getFieldType() == DeliverableFieldType.DRIVE_PDF).findFirst()
            .orElseGet(() -> fields.stream().filter(DeliverableField::isActive).filter(item -> item.getFieldType() == DeliverableFieldType.GENERAL_URL)
                .filter(item -> (normalize(item.getFieldKey()) + normalize(item.getLabel())).matches(".*(pdf|link|srs).*"))
                .findFirst().orElse(null));
    }

    private Map<String, Object> readValues(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> values = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
            return values == null ? Map.of() : values;
        }
        catch (Exception failure) { return Map.of(); }
    }

    private static ValidationStudyService.AuditCheck pass(String reason) { return new ValidationStudyService.AuditCheck("PASS", reason); }
    private static ValidationStudyService.AuditCheck fail(String reason) { return new ValidationStudyService.AuditCheck("FAIL", reason); }
    private static ValidationStudyService.AuditCheck unver(String reason) { return new ValidationStudyService.AuditCheck("UNVERIFIED", reason); }
    private static boolean same(String first, String second) { return normalizeStudentNumber(first).equals(normalizeStudentNumber(second)); }
    private static String normalize(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", ""); }
    private static String normalizeStudentNumber(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
    private static String stringValue(Object value) { return value == null ? "" : String.valueOf(value).trim(); }
    private static boolean hasUsableValue(DeliverableField field, Object value) {
        if (value == null) return false;
        if (field.getFieldType() == DeliverableFieldType.DRIVE_PDF || field.getFieldType() == DeliverableFieldType.GENERAL_URL) {
            return value instanceof String && !((String) value).trim().isBlank();
        }
        if (field.getFieldType() == DeliverableFieldType.CHECKBOXES) {
            return value instanceof List<?> list && !list.isEmpty()
                && list.stream().allMatch(item -> item instanceof String && !((String) item).isBlank());
        }
        return value instanceof String string && !string.trim().isBlank()
            || value instanceof Number || value instanceof Boolean;
    }
    private record Candidate(FormResponse response, Instant sortAt, ValidationStudyService.InitialSavedRecord record) { }
}
