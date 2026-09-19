package com.capvault.backend.validationstudy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldOption;
import com.capvault.backend.deliverable.DeliverableFieldOptionRepository;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.response.FormResponseVersion;
import com.capvault.backend.response.FormResponseVersionRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ValidationStudyService {

    private static final String INITIAL_SUBMISSION = "initial submission";
    private static final String REVISED_SUBMISSION = "revised submission";

    private final DeliverableRepository deliverableRepository;
    private final DeliverableFieldRepository fieldRepository;
    private final DeliverableFieldOptionRepository optionRepository;
    private final FormResponseRepository responseRepository;
    private final FormResponseVersionRepository versionRepository;
    private final ObjectMapper objectMapper;

    public ValidationStudyService(
        DeliverableRepository deliverableRepository,
        DeliverableFieldRepository fieldRepository,
        DeliverableFieldOptionRepository optionRepository,
        FormResponseRepository responseRepository,
        FormResponseVersionRepository versionRepository,
        ObjectMapper objectMapper
    ) {
        this.deliverableRepository = deliverableRepository;
        this.fieldRepository = fieldRepository;
        this.optionRepository = optionRepository;
        this.responseRepository = responseRepository;
        this.versionRepository = versionRepository;
        this.objectMapper = objectMapper;
    }

    public record Counts(
        int uniqueCurrentResponses,
        int uniqueCurrentStudents,
        int t1Observed,
        int t2Complete,
        int passingBoth
    ) {
    }

    public record Checks(
        boolean initialSubmissionSeen,
        boolean initialArtifactPresent,
        boolean revisedSubmissionCurrent,
        boolean currentArtifactPresent,
        boolean sameResponse,
        boolean revisionIncreased,
        boolean materialEditHistoryPresent,
        Boolean pdfUnchanged,
        Boolean nonDesignatedValuesPreserved,
        boolean overallPass
    ) {
    }

    public record RevisionEvidence(
        long revision,
        Instant createdAt,
        String validationStepValue,
        String artifactValue
    ) {
    }

    public record ResponseEvidence(
        UUID responseId,
        String studentNumber,
        String studentName,
        String teamCode,
        long currentRevision,
        Instant submittedAt,
        Instant updatedAt,
        String validationStepValue,
        String artifactValue,
        Checks checks,
        List<RevisionEvidence> history
    ) {
    }

    public record Evidence(
        UUID deliverableId,
        String deliverableTitle,
        String trackerColumnKey,
        String validationStepFieldKey,
        String validationStepFieldLabel,
        String artifactFieldKey,
        String artifactFieldLabel,
        Counts counts,
        List<ResponseEvidence> responses,
        List<String> warnings,
        List<String> limitations
    ) {
    }

    private record Snapshot(long revision, Instant createdAt, Map<String, Object> values) {
    }

    @Transactional(readOnly = true)
    public Evidence evidence(UUID workspaceId, UUID deliverableId) {
        Deliverable deliverable = deliverableRepository.findById(deliverableId)
            .filter(item -> workspaceId.equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable was not found in this workspace."));

        List<DeliverableField> fields = fieldRepository
            .findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverableId);
        DeliverableField validationField = findValidationStepField(fields);
        DeliverableField artifactField = findArtifactField(fields);
        Map<String, String> validationOptions = validationField == null
            ? Map.of()
            : optionLabels(validationField.getId());

        List<String> warnings = new ArrayList<>();
        if (validationField == null) {
            warnings.add("No Validation Step field was detected for this deliverable. T1/T2 state cannot be inferred.");
        }
        if (artifactField == null) {
            warnings.add("No PDF/link field was detected for this deliverable. Artifact-preservation checks cannot be inferred.");
        }

        List<FormResponse> currentResponses = responseRepository.findAllByDeliverableId(deliverableId).stream()
            .filter(response -> workspaceId.equals(response.getWorkspaceId()))
            .sorted((first, second) -> {
                int student = safe(first.getStudentNumber()).compareToIgnoreCase(safe(second.getStudentNumber()));
                if (student != 0) return student;
                return first.getId().compareTo(second.getId());
            })
            .toList();

        List<ResponseEvidence> rows = currentResponses.stream()
            .map(response -> responseEvidence(response, validationField, artifactField, validationOptions))
            .toList();

        Set<String> students = new LinkedHashSet<>();
        for (ResponseEvidence row : rows) students.add(normalize(row.studentNumber()));
        Counts counts = new Counts(
            rows.size(),
            (int) students.stream().filter(item -> !item.isBlank()).count(),
            (int) rows.stream().filter(row -> row.checks().initialSubmissionSeen()).count(),
            (int) rows.stream().filter(this::isT2Complete).count(),
            (int) rows.stream().filter(row -> row.checks().overallPass()).count()
        );

        return new Evidence(
            deliverable.getId(),
            deliverable.getTitle(),
            deliverable.getTrackerColumnKey(),
            validationField == null ? null : validationField.getFieldKey(),
            validationField == null ? null : validationField.getLabel(),
            artifactField == null ? null : artifactField.getFieldKey(),
            artifactField == null ? null : artifactField.getLabel(),
            counts,
            rows,
            List.copyOf(warnings),
            List.of(
                "This evidence view can confirm persisted response/version invariants only. The prescribed rejected blank-link attempt is not persisted in FormResponse history and must be corroborated from the controlled task log.",
                "Student-visible readback correctness is not inferred from these server records and must be corroborated from the controlled observation evidence."
            )
        );
    }

    private ResponseEvidence responseEvidence(
        FormResponse response,
        DeliverableField validationField,
        DeliverableField artifactField,
        Map<String, String> validationOptions
    ) {
        Map<String, Object> currentValues = readValues(response.getValuesJson());
        String validationKey = validationField == null ? null : validationField.getFieldKey();
        String artifactKey = artifactField == null ? null : artifactField.getFieldKey();
        String currentStep = displayValue(valueFor(currentValues, validationKey), validationOptions);
        String currentArtifact = stringValue(valueFor(currentValues, artifactKey));

        List<Snapshot> snapshots = versionRepository.findAllByResponseIdOrderByRevisionAsc(response.getId()).stream()
            .map(version -> new Snapshot(version.getRevision(), version.getCreatedAt(), readValues(version.getValuesJson())))
            .toList();
        List<RevisionEvidence> history = snapshots.stream()
            .map(snapshot -> new RevisionEvidence(
                snapshot.revision(),
                snapshot.createdAt(),
                displayValue(valueFor(snapshot.values(), validationKey), validationOptions),
                stringValue(valueFor(snapshot.values(), artifactKey))
            ))
            .toList();

        Snapshot initial = null;
        for (Snapshot snapshot : snapshots) {
            String step = displayValue(valueFor(snapshot.values(), validationKey), validationOptions);
            if (isInitial(step)) initial = snapshot;
        }
        if (initial == null && isInitial(currentStep)) {
            initial = new Snapshot(response.getRevision(), response.getUpdatedAt(), currentValues);
        }

        boolean initialSeen = initial != null;
        boolean revisedCurrent = isRevised(currentStep);
        String initialArtifact = initial == null ? "" : stringValue(valueFor(initial.values(), artifactKey));
        boolean initialArtifactPresent = artifactField != null && !initialArtifact.isBlank();
        boolean currentArtifactPresent = artifactField != null && !currentArtifact.isBlank();
        boolean sameResponse = initialSeen;
        boolean materialHistory = !snapshots.isEmpty();
        boolean revisionIncreased = initial != null && response.getRevision() > initial.revision();

        Boolean pdfUnchanged = null;
        Boolean nonDesignatedPreserved = null;
        if (initial != null && revisedCurrent) {
            if (initialArtifactPresent && currentArtifactPresent) {
                pdfUnchanged = normalizeUrl(initialArtifact).equals(normalizeUrl(currentArtifact));
            }
            nonDesignatedPreserved = valuesWithout(initial.values(), validationKey)
                .equals(valuesWithout(currentValues, validationKey));
        }

        boolean overallPass = initialSeen
            && initialArtifactPresent
            && revisedCurrent
            && currentArtifactPresent
            && sameResponse
            && materialHistory
            && revisionIncreased
            && Boolean.TRUE.equals(pdfUnchanged)
            && Boolean.TRUE.equals(nonDesignatedPreserved);

        Checks checks = new Checks(
            initialSeen,
            initialArtifactPresent,
            revisedCurrent,
            currentArtifactPresent,
            sameResponse,
            revisionIncreased,
            materialHistory,
            pdfUnchanged,
            nonDesignatedPreserved,
            overallPass
        );
        return new ResponseEvidence(
            response.getId(),
            response.getStudentNumber(),
            response.getStudentName(),
            response.getTeamCode(),
            response.getRevision(),
            response.getSubmittedAt(),
            response.getUpdatedAt(),
            currentStep,
            currentArtifact,
            checks,
            history
        );
    }

    private boolean isT2Complete(ResponseEvidence row) {
        Checks checks = row.checks();
        return checks.initialSubmissionSeen()
            && checks.revisedSubmissionCurrent()
            && checks.sameResponse()
            && checks.materialEditHistoryPresent()
            && checks.revisionIncreased();
    }

    private DeliverableField findValidationStepField(List<DeliverableField> fields) {
        return fields.stream()
            .filter(DeliverableField::isActive)
            .filter(this::looksLikeValidationStep)
            .findFirst()
            .orElseGet(() -> fields.stream().filter(this::looksLikeValidationStep).findFirst().orElse(null));
    }

    private boolean looksLikeValidationStep(DeliverableField field) {
        String text = normalize(field.getFieldKey()) + " " + normalize(field.getLabel());
        return text.contains("validationstep") || (text.contains("validation") && text.contains("step"));
    }

    private DeliverableField findArtifactField(List<DeliverableField> fields) {
        DeliverableField directPdf = fields.stream()
            .filter(DeliverableField::isActive)
            .filter(field -> field.getFieldType() == DeliverableFieldType.DRIVE_PDF)
            .findFirst().orElse(null);
        if (directPdf != null) return directPdf;
        DeliverableField namedLink = fields.stream()
            .filter(DeliverableField::isActive)
            .filter(field -> field.getFieldType() == DeliverableFieldType.GENERAL_URL)
            .filter(field -> {
                String text = normalize(field.getFieldKey()) + normalize(field.getLabel());
                return text.contains("pdf") || text.contains("link") || text.contains("srs");
            })
            .findFirst().orElse(null);
        if (namedLink != null) return namedLink;
        return fields.stream()
            .filter(DeliverableField::isActive)
            .filter(field -> field.getFieldType() == DeliverableFieldType.GENERAL_URL)
            .findFirst().orElse(null);
    }

    private Map<String, String> optionLabels(String fieldId) {
        Map<String, String> labels = new LinkedHashMap<>();
        for (DeliverableFieldOption option : optionRepository.findAllByFieldIdOrderByDisplayOrderAscLabelAsc(fieldId)) {
            labels.put(option.getId(), option.getLabel());
        }
        return labels;
    }

    private String displayValue(Object raw, Map<String, String> optionLabels) {
        String value = stringValue(raw);
        return optionLabels.getOrDefault(value, value);
    }

    private Map<String, Object> readValues(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception failure) {
            throw new IllegalStateException("Stored response values could not be read for Validation Study evidence.", failure);
        }
    }

    private Map<String, Object> valuesWithout(Map<String, Object> values, String excludedKey) {
        Map<String, Object> copy = new LinkedHashMap<>(values == null ? Map.of() : values);
        if (excludedKey != null) copy.remove(excludedKey);
        return copy;
    }

    private static Object valueFor(Map<String, Object> values, String key) {
        return values == null || key == null ? null : values.get(key);
    }

    private static boolean isInitial(String value) {
        return INITIAL_SUBMISSION.equals(safe(value).trim().toLowerCase(Locale.ROOT));
    }

    private static boolean isRevised(String value) {
        return REVISED_SUBMISSION.equals(safe(value).trim().toLowerCase(Locale.ROOT));
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String normalizeUrl(String value) {
        return safe(value).trim();
    }

    private static String normalize(String value) {
        return safe(value).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
