package com.capvault.backend.response;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableField;
import com.capvault.backend.deliverable.DeliverableFieldOption;
import com.capvault.backend.deliverable.DeliverableFieldOptionRepository;
import com.capvault.backend.deliverable.DeliverableFieldRepository;
import com.capvault.backend.deliverable.DeliverableFieldType;
import com.capvault.backend.deliverable.DocumentCheckPolicy;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.drive.DriveLinkParser;
import com.capvault.backend.filecheck.FileCheckRequest;
import com.capvault.backend.filecheck.FileCheckService;
import com.capvault.backend.student.StudentAssociationService;
import com.capvault.backend.student.StudentRecord;
import com.capvault.backend.student.StudentRecordRepository;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class FormResponseService {

    private final FormResponseRepository responseRepository;
    private final FormResponseVersionRepository versionRepository;
    private final StudentAssociationService associationService;
    private final StudentRecordRepository studentRecordRepository;
    private final DeliverableRepository deliverableRepository;
    private final DeliverableFieldRepository fieldRepository;
    private final DeliverableFieldOptionRepository optionRepository;
    private final FileCheckService fileCheckService;
    private final Clock clock;
    private final DomainEventRecorder events;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FormResponseService(
        FormResponseRepository responseRepository,
        FormResponseVersionRepository versionRepository,
        StudentAssociationService associationService,
        StudentRecordRepository studentRecordRepository,
        DeliverableRepository deliverableRepository,
        DeliverableFieldRepository fieldRepository,
        DeliverableFieldOptionRepository optionRepository,
        FileCheckService fileCheckService,
        Clock clock,
        DomainEventRecorder events
    ) {
        this.responseRepository = responseRepository;
        this.versionRepository = versionRepository;
        this.associationService = associationService;
        this.studentRecordRepository = studentRecordRepository;
        this.deliverableRepository = deliverableRepository;
        this.fieldRepository = fieldRepository;
        this.optionRepository = optionRepository;
        this.fileCheckService = fileCheckService;
        this.clock = clock;
        this.events = events;
    }

    public record SaveResult(
        boolean changed,
        FormResponse response,
        Long clientRevision
    ) {
    }

    public record SubmitCommand(
        UUID workspaceId,
        UUID deliverableId,
        String googleSubject,
        String googleEmail,
        String studentNumber,
        Map<String, Object> values,
        Long revision
    ) {
        public SubmitCommand(UUID workspaceId, UUID deliverableId, String googleSubject, String googleEmail, Map<String, Object> values) {
            this(workspaceId, deliverableId, googleSubject, googleEmail, null, values, null);
        }

        public SubmitCommand(UUID workspaceId, UUID deliverableId, String googleSubject, String googleEmail,
                Map<String, Object> values, Long revision) {
            this(workspaceId, deliverableId, googleSubject, googleEmail, null, values, revision);
        }
    }

    @Transactional
    public SaveResult submit(SubmitCommand command) {
        Deliverable deliverable = deliverableRepository.findById(command.deliverableId())
            .filter(item -> command.workspaceId().equals(item.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable not found."));
        if (deliverable.getStatus() != DeliverableStatus.PUBLISHED) {
            throw new IllegalStateException("This form is no longer accepting responses.");
        }
        List<DeliverableField> allPersistedFields = fieldRepository
            .findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable.getId());
        List<DeliverableField> persistedFields = allPersistedFields.stream()
            .filter(DeliverableField::isActive)
            .toList();
        List<DeliverableField> submissionFields = allPersistedFields.isEmpty()
            ? List.of(legacyField(deliverable))
            : persistedFields;
        Map<String, Object> submittedValues = command.values() == null ? Map.of() : command.values();
        if (!allPersistedFields.isEmpty()) {
            validateSubmissionFields(persistedFields, submittedValues);
        }
        Instant now = clock.instant();
        Optional<FormResponse> existing = responseRepository
            .findByWorkspaceIdAndDeliverableIdAndGoogleSubject(command.workspaceId(), command.deliverableId(), command.googleSubject());

        String selectedStudentNumber = command.studentNumber() == null ? "" : command.studentNumber().trim();
        if (existing.isPresent()) {
            if (!selectedStudentNumber.isBlank()
                    && !existing.get().getStudentNumber().equalsIgnoreCase(selectedStudentNumber)) {
                throw new StudentAssociationService.AccountBindingConflictException(
                    "This saved response belongs to a different Student Number. Reload your student record before editing it.");
            }
            selectedStudentNumber = existing.get().getStudentNumber();
        }
        if (selectedStudentNumber.isBlank()) {
            selectedStudentNumber = associationService.activeAssociation(command.workspaceId(), command.googleSubject())
                .map(StudentAssociationService.AssociationView::studentNumber)
                .orElse("");
        }
        StudentAssociationService.AssociationView association = associationService.associationForSuccessfulSave(
            command.workspaceId(), command.googleSubject(), command.googleEmail(), selectedStudentNumber, existing.isPresent());
        if (!allPersistedFields.isEmpty()
                && persistedFields.stream().anyMatch(field -> field.getFieldType().isAcademicIdentity())) {
            StudentRecord record = studentRecordRepository.findById(association.studentRecordId())
                .filter(item -> command.workspaceId().equals(item.getWorkspaceId()) && item.isCurrentActive())
                .orElseThrow(() -> new IllegalStateException("The connected Student Record is no longer available in this workspace."));
            validateAcademicFieldRequirements(persistedFields, record);
        }

        if (existing.isPresent()) {
            FormResponse response = existing.get();
            if (!java.util.Objects.equals(command.revision(), response.getRevision())) {
                throw new ConcurrentModificationException();
            }
            String currentJson = response.getValuesJson();
            Map<String, Object> currentValues = fromJson(currentJson);
            Map<String, Object> nextValues = preserveRetiredValues(currentValues, submittedValues, persistedFields);
            String nextJson = toJson(nextValues);
            if (currentValues.equals(nextValues)) {
                return new SaveResult(false, response, response.getRevision()); // identical resave: untouched
            }
            archiveVersion(response, now);
            response.setValuesJson(nextJson);
            response.setUpdatedAt(now);
            // revision increments via @Version on flush; keep client-visible in sync:
            try {
                responseRepository.saveAndFlush(response);
            } catch (OptimisticLockingFailureException e) {
                throw new ConcurrentModificationException();
            }
            events.responseSaved(response);
            triggerAsyncDocumentChecks(command.workspaceId(), deliverable, submissionFields, response, nextValues, currentValues);
            return new SaveResult(true, response, response.getRevision());
        }

        // First successful save and canonical account binding share this transaction.
        if (command.revision() != null) throw new ConcurrentModificationException();
        FormResponse created = new FormResponse(
            UUID.randomUUID(),
            command.workspaceId(),
            command.deliverableId(),
            command.googleSubject(),
            command.googleEmail(),
            association.studentRecordId(),
            association.studentNumber(),
            association.studentName(),
            association.teamCode(),
            toJson(submittedValues),
            now,
            now
        );
        created = responseRepository.saveAndFlush(created);
        events.responseSaved(created);
        triggerAsyncDocumentChecks(command.workspaceId(), deliverable, submissionFields, created, submittedValues, Map.of());
        return new SaveResult(true, created, created.getRevision());
    }

    private void triggerAsyncDocumentChecks(UUID workspaceId, Deliverable deliverable, List<DeliverableField> fields,
            FormResponse response, Map<String, Object> values, Map<String, Object> previousValues) {
        if (fileCheckService == null) return;
        String responseId = response.getId().toString();
        String deliverableKey = deliverable.getTrackerColumnKey() != null && !deliverable.getTrackerColumnKey().isBlank()
            ? deliverable.getTrackerColumnKey()
            : deliverable.getSlug();
        String updatedAt = response.getUpdatedAt() != null
            ? response.getUpdatedAt().toString()
            : response.getSubmittedAt().toString();

        List<Runnable> checks = fields.stream()
            .filter(field -> field.getFieldType() == DeliverableFieldType.DRIVE_PDF)
            .filter(field -> field.getDocumentCheckPolicy() == DocumentCheckPolicy.AUTO)
            .filter(field -> !sameFieldValue(previousValues, values, field.getFieldKey()))
            .map(field -> {
                String link = stringValue(values.get(field.getFieldKey()));
                return (Runnable) () -> {
                    if (link.isBlank()) return;
                    try {
                        fileCheckService.check(workspaceId,
                            new FileCheckRequest(responseId, field.getId(), deliverableKey, link, updatedAt));
                    } catch (Exception ignored) {
                        // A document-provider failure must never fail or roll back the submission.
                    }
                };
            })
            .toList();
        if (checks.isEmpty()) return;
        Runnable scheduleChecks = () -> checks.forEach(check -> CompletableFuture.runAsync(check));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    scheduleChecks.run();
                }
            });
        } else {
            scheduleChecks.run();
        }
    }

    private void validateSubmissionFields(List<DeliverableField> fields, Map<String, Object> values) {
        Map<String, Object> safeValues = values == null ? Map.of() : values;
        Map<String, DeliverableField> fieldsByKey = fields.stream()
            .collect(Collectors.toMap(DeliverableField::getFieldKey, field -> field));
        for (String submittedKey : safeValues.keySet()) {
            DeliverableField submittedField = fieldsByKey.get(submittedKey);
            if (submittedField == null) {
                throw new IllegalArgumentException("Unknown submission field: " + submittedKey);
            }
            if (submittedField.getFieldType().isAcademicIdentity()
                    && submittedField.getFieldType() != DeliverableFieldType.ACADEMIC_SECTION) {
                throw new IllegalArgumentException(
                    submittedField.getLabel() + " comes from the connected Student Record and cannot be submitted as a response value.");
            }
        }

        Set<String> optionFieldIds = fields.stream()
            .filter(field -> field.getFieldType().isChoice())
            .map(DeliverableField::getId)
            .collect(Collectors.toSet());
        Map<String, Set<String>> allowedOptions = optionFieldIds.isEmpty() ? Map.of()
            : optionRepository.findAllByFieldIdInOrderByFieldIdAscDisplayOrderAscLabelAsc(optionFieldIds).stream()
                .collect(Collectors.groupingBy(
                    DeliverableFieldOption::getFieldId,
                    Collectors.mapping(DeliverableFieldOption::getId, Collectors.toSet())));

        for (DeliverableField field : fields) {
            if (field.getFieldType().isAcademicIdentity()
                    && field.getFieldType() != DeliverableFieldType.ACADEMIC_SECTION) continue;
            Object rawValue = safeValues.get(field.getFieldKey());
            boolean missing = isMissingValue(field, rawValue);
            if (field.isRequired() && missing) {
                throw new IllegalArgumentException(field.getLabel() + " is required.");
            }
            if (missing) continue;

            if (field.getFieldType() == DeliverableFieldType.TEXTAREA
                    || field.getFieldType() == DeliverableFieldType.SHORT_TEXT
                    || field.getFieldType() == DeliverableFieldType.ACADEMIC_SECTION) {
                requireString(field, rawValue);
                continue;
            }
            if (field.getFieldType() == DeliverableFieldType.DROPDOWN
                    || field.getFieldType() == DeliverableFieldType.MULTIPLE_CHOICE) {
                String optionId = requireString(field, rawValue).trim();
                if (!allowedOptions.getOrDefault(field.getId(), Set.of()).contains(optionId)) {
                    throw new IllegalArgumentException(field.getLabel() + " contains an unknown choice option.");
                }
                continue;
            }
            if (field.getFieldType() == DeliverableFieldType.CHECKBOXES) {
                validateCheckboxes(field, rawValue, allowedOptions.getOrDefault(field.getId(), Set.of()));
                continue;
            }

            String value = requireString(field, rawValue).trim();
            java.net.URI uri;
            try {
                uri = java.net.URI.create(value);
            } catch (IllegalArgumentException invalid) {
                throw new IllegalArgumentException(field.getLabel() + " must be a complete http or https URL.");
            }
            if (uri.getScheme() == null || !(uri.getScheme().equalsIgnoreCase("http") || uri.getScheme().equalsIgnoreCase("https"))) {
                throw new IllegalArgumentException(field.getLabel() + " must be a complete http or https URL.");
            }
            String host = String.valueOf(uri.getHost()).toLowerCase(Locale.ROOT);
            String path = String.valueOf(uri.getPath()).toLowerCase(Locale.ROOT);
            switch (field.getFieldType()) {
                case DRIVE_PDF -> {
                    try { DriveLinkParser.parse(value); }
                    catch (IllegalArgumentException invalid) {
                        throw new IllegalArgumentException(field.getLabel() + " must be a Google Drive file link.");
                    }
                }
                case GOOGLE_FORM -> {
                    if (!(host.equals("forms.gle") || (host.equals("docs.google.com") && path.contains("/forms/"))))
                        throw new IllegalArgumentException(field.getLabel() + " must be a Google Forms link.");
                }
                case GOOGLE_SHEET -> {
                    if (!(host.equals("docs.google.com") && path.contains("/spreadsheets/")))
                        throw new IllegalArgumentException(field.getLabel() + " must be a Google Sheets link.");
                }
                case DRIVE_FOLDER -> {
                    if (!(host.equals("drive.google.com") && path.contains("/folders/")))
                        throw new IllegalArgumentException(field.getLabel() + " must be a Google Drive folder link.");
                }
                default -> { }
            }
        }
    }

    private static void validateAcademicFieldRequirements(List<DeliverableField> fields, StudentRecord record) {
        for (DeliverableField field : fields) {
            if (!field.isRequired() || !field.getFieldType().isAcademicIdentity()
                    || field.getFieldType() == DeliverableFieldType.ACADEMIC_SECTION) continue;
            String value = switch (field.getFieldType()) {
                case ACADEMIC_STUDENT_NUMBER -> record.getStudentNumber();
                case ACADEMIC_STUDENT_NAME -> record.getStudentName();
                case ACADEMIC_TEAM_CODE -> record.getTeamCode();
                case ACADEMIC_SECTION -> record.getSectionName();
                default -> null;
            };
            if (value == null || value.isBlank()) {
                throw new IllegalArgumentException(
                    field.getLabel() + " is required, but the connected Student Record has no value for it.");
            }
        }
    }

    private static boolean isMissingValue(DeliverableField field, Object value) {
        if (value == null) return true;
        if (field.getFieldType() == DeliverableFieldType.CHECKBOXES) {
            return value instanceof List<?> list && list.isEmpty();
        }
        return value instanceof String text && text.trim().isEmpty();
    }

    private static String requireString(DeliverableField field, Object value) {
        if (!(value instanceof String text)) {
            throw new IllegalArgumentException(field.getLabel() + " must be a text value.");
        }
        return text;
    }

    private static void validateCheckboxes(DeliverableField field, Object value, Set<String> allowedOptions) {
        if (!(value instanceof List<?> values)) {
            throw new IllegalArgumentException(field.getLabel() + " must be a list of choice option IDs.");
        }
        Set<String> selected = new java.util.LinkedHashSet<>();
        for (Object item : values) {
            if (!(item instanceof String optionId) || optionId.isBlank()) {
                throw new IllegalArgumentException(field.getLabel() + " must contain only choice option IDs.");
            }
            String normalized = optionId.trim();
            if (!selected.add(normalized)) {
                throw new IllegalArgumentException(field.getLabel() + " cannot contain the same choice more than once.");
            }
            if (!allowedOptions.contains(normalized)) {
                throw new IllegalArgumentException(field.getLabel() + " contains an unknown choice option.");
            }
        }
    }

    private static Map<String, Object> preserveRetiredValues(
        Map<String, Object> currentValues,
        Map<String, Object> submittedValues,
        List<DeliverableField> activeFields
    ) {
        Set<String> activeKeys = activeFields.stream()
            .map(DeliverableField::getFieldKey)
            .collect(Collectors.toSet());
        Map<String, Object> merged = new java.util.LinkedHashMap<>(submittedValues);
        currentValues.forEach((key, value) -> {
            if (!activeKeys.contains(key)) merged.putIfAbsent(key, value);
        });
        return merged;
    }

    private DeliverableField legacyField(Deliverable deliverable) {
        boolean pdf = deliverable.isPdfRequired();
        return new DeliverableField(
            null,
            deliverable.getId(),
            pdf ? "documentPdf" : "primaryLink",
            pdf ? "PDF Drive Link" : "Submission Link",
            pdf ? DeliverableFieldType.DRIVE_PDF : DeliverableFieldType.GENERAL_URL,
            true,
            0,
            pdf ? DocumentCheckPolicy.AUTO : DocumentCheckPolicy.OFF,
            pdf,
            true
        );
    }

    private static boolean sameFieldValue(Map<String, Object> previous, Map<String, Object> current, String fieldKey) {
        return stringValue(previous == null ? null : previous.get(fieldKey))
            .equals(stringValue(current == null ? null : current.get(fieldKey)));
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
    /**
     * Private response reads require both the original Google subject and the currently active
     * canonical/workspace association. An Admin disconnect therefore revokes the old account's
     * read/edit path until that account is explicitly recovered.
     */
    @Transactional(readOnly = true)
    public Optional<FormResponse> ownedResponse(UUID workspaceId, UUID deliverableId, String googleSubject) {
        if (googleSubject == null || googleSubject.isBlank()) return Optional.empty();
        return responseRepository.findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, googleSubject)
            .filter(response -> associationService.activeAssociation(workspaceId, googleSubject)
                .map(association -> association.studentRecordId().equals(response.getStudentRecordId()))
                .orElse(false));
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> history(UUID workspaceId, UUID deliverableId, String googleSubject) {
        FormResponse response = ownedResponse(workspaceId, deliverableId, googleSubject)
            .orElseThrow(() -> new IllegalArgumentException("No response exists for that identity."));
        List<FormResponseVersion> versions = versionRepository.findAllByResponseIdOrderByRevisionAsc(response.getId());
        List<Map<String, Object>> history = new ArrayList<>();
        for (FormResponseVersion version : versions) {
            history.add(Map.of("revision", version.getRevision(), "values", fromJson(version.getValuesJson()), "savedAt", version.getCreatedAt().toString()));
        }
        return history;
    }

    @Transactional(readOnly = true)
    public List<FormResponse> responsesForWorkspace(UUID workspaceId) {
        return responseRepository.findAllByWorkspaceId(workspaceId);
    }

    @Transactional(readOnly = true)
    public List<FormResponse> responsesForSubject(UUID workspaceId, String googleSubject) {
        return responseRepository.findAllByWorkspaceIdAndGoogleSubject(workspaceId, googleSubject);
    }

    /**
     * Adviser-scoped read: only submissions whose snapshotted team code matches one of the
     * caller's assigned teams. Filtering lives on the server so a direct API call cannot
     * widen the result set beyond the assignment list.
     */
    @Transactional(readOnly = true)
    public List<FormResponse> responsesForTeams(UUID workspaceId, Collection<String> teamCodes) {
        if (teamCodes == null || teamCodes.isEmpty()) {
            return List.of();
        }
        Set<String> allowed = teamCodes.stream()
            .filter(code -> code != null && !code.isBlank())
            .map(code -> code.trim().toLowerCase(Locale.ROOT))
            .collect(Collectors.toSet());
        if (allowed.isEmpty()) {
            return List.of();
        }
        return responseRepository.findAllByWorkspaceId(workspaceId).stream()
            .filter(response -> response.getTeamCode() != null
                && allowed.contains(response.getTeamCode().trim().toLowerCase(Locale.ROOT)))
            .toList();
    }

    private void archiveVersion(FormResponse response, Instant savedAt) {
        versionRepository.save(new FormResponseVersion(
            UUID.randomUUID(), response, response.getValuesJson(), response.getRevision(), savedAt));
    }

    private String toJson(Map<String, Object> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (Exception e) {
            throw new IllegalArgumentException("Values could not be serialized.", e);
        }
    }

    private Map<String, Object> fromJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("Stored values could not be read.", e);
        }
    }

    public static class ConcurrentModificationException extends RuntimeException {
        public ConcurrentModificationException() {
            super("A newer version was saved by another session. Reload to continue editing.");
        }
    }
}
