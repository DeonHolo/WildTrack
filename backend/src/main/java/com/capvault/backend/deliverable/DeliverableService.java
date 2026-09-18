package com.capvault.backend.deliverable;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.capvault.backend.response.FormResponseRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DeliverableService {

    private final DeliverableRepository repository;
    private final DeliverableFieldRepository fieldRepository;
    private final DeliverableFieldOptionRepository optionRepository;
    private final FormResponseRepository responseRepository;

    public DeliverableService(
        DeliverableRepository repository,
        DeliverableFieldRepository fieldRepository,
        DeliverableFieldOptionRepository optionRepository,
        FormResponseRepository responseRepository
    ) {
        this.repository = repository;
        this.fieldRepository = fieldRepository;
        this.optionRepository = optionRepository;
        this.responseRepository = responseRepository;
    }

    @Transactional(readOnly = true)
    public List<DeliverableResponse> listDeliverables(UUID workspaceId) {
        return repository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId)
            .stream()
            .map(this::response)
            .toList();
    }

    @Transactional(readOnly = true)
    public DeliverableResponse getDeliverable(UUID workspaceId, UUID id) {
        return response(findRequired(workspaceId, id));
    }

    @Transactional(readOnly = true)
    public DeliverableResponse getPublishedDeliverableBySlug(UUID workspaceId, String slug) {
        String normalizedTarget = normalizeSlug(slug, slug);
        return repository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId)
            .stream()
            .filter(d -> d.getStatus() == DeliverableStatus.PUBLISHED)
            .filter(d -> {
                String dSlug = normalizeSlug(d.getSlug(), d.getTitle());
                String dCol = normalizeSlug(d.getTrackerColumnKey(), d.getTrackerColumnKey());
                return dSlug.equalsIgnoreCase(normalizedTarget)
                    || dCol.equalsIgnoreCase(normalizedTarget)
                    || d.getId().toString().equalsIgnoreCase(slug.trim());
            })
            .findFirst()
            .map(this::response)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Published form was not found."));
    }

    @Transactional
    public DeliverableResponse createDeliverable(UUID workspaceId, DeliverableRequest request) {
        String title = request.title().trim();
        String slug = normalizeSlug(request.slug(), title);
        if (repository.existsByWorkspaceIdAndSlug(workspaceId, slug)) {
            throw new IllegalArgumentException("A deliverable with this slug already exists.");
        }
        if (request.fields() != null && !request.fields().isEmpty()) {
            validateFields(request.fields());
        }

        Deliverable deliverable = new Deliverable(
            workspaceId,
            request.trackerColumnKey().trim(),
            title,
            slug,
            normalizeNullable(request.instructions()),
            request.dueAt(),
            request.pdfRequired(),
            request.status() == null ? DeliverableStatus.PUBLISHED : request.status()
        );

        deliverable = repository.saveAndFlush(deliverable);
        saveFields(deliverable, request.fields(), true);
        deliverable.touch();
        deliverable = repository.saveAndFlush(deliverable);
        return response(deliverable);
    }

    @Transactional
    public DeliverableResponse updateDeliverable(UUID workspaceId, UUID id, DeliverableRequest request) {
        Deliverable deliverable = findRequired(workspaceId, id);
        if (request.expectedUpdatedAt() != null && !request.expectedUpdatedAt().equals(deliverable.getUpdatedAt())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "This deliverable changed after you opened it. Reload before saving.");
        }
        String title = request.title().trim();
        String requestedSlug = normalizeNullable(request.slug());
        if (requestedSlug != null && !normalizeSlug(requestedSlug, title).equals(deliverable.getSlug())) {
            throw new IllegalArgumentException("A published form slug cannot be changed. Keep the existing form URL.");
        }

        deliverable.setTrackerColumnKey(request.trackerColumnKey().trim());
        deliverable.setTitle(title);
        deliverable.setInstructions(normalizeNullable(request.instructions()));
        deliverable.setDueAt(request.dueAt());
        deliverable.setStatus(request.status() == null ? DeliverableStatus.PUBLISHED : request.status());
        saveFields(deliverable, request.fields(), false);
        deliverable.touch();
        deliverable = repository.saveAndFlush(deliverable);
        return response(deliverable);
    }

    @Transactional
    public List<DeliverableResponse> unpublishAll(UUID workspaceId) {
        List<Deliverable> deliverables = repository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId);
        List<Deliverable> changed = deliverables.stream()
            .filter(deliverable -> deliverable.getStatus() == DeliverableStatus.PUBLISHED)
            .peek(deliverable -> deliverable.setStatus(DeliverableStatus.UNPUBLISHED))
            .toList();
        if (!changed.isEmpty()) repository.saveAllAndFlush(changed);
        return deliverables.stream().map(this::response).toList();
    }

    private DeliverableResponse response(Deliverable deliverable) {
        List<DeliverableField> fields = activeOrLegacyFields(deliverable);
        Set<String> persistedIds = fields.stream()
            .map(DeliverableField::getId)
            .filter(id -> id != null)
            .collect(Collectors.toSet());
        Map<String, List<DeliverableFieldOption>> optionsByField = persistedIds.isEmpty()
            ? Map.of()
            : optionRepository.findAllByFieldIdInOrderByFieldIdAscDisplayOrderAscLabelAsc(persistedIds).stream()
                .collect(Collectors.groupingBy(DeliverableFieldOption::getFieldId, java.util.LinkedHashMap::new, Collectors.toList()));
        List<DeliverableFieldResponse> fieldResponses = fields.stream()
            .map(field -> DeliverableFieldResponse.from(field, optionsByField.getOrDefault(field.getId(), List.of())))
            .toList();
        return DeliverableResponse.from(deliverable, fieldResponses);
    }

    private List<DeliverableField> activeOrLegacyFields(Deliverable deliverable) {
        List<DeliverableField> fields = fieldRepository.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable.getId());
        if (!fields.isEmpty()) return fields;
        DeliverableField fallback = legacyField(deliverable, deliverable.isPdfRequired());
        return List.of(fallback);
    }

    private void saveFields(Deliverable deliverable, List<DeliverableFieldRequest> requested, boolean creating) {
        List<DeliverableField> existing = fieldRepository.findAllByDeliverableIdOrderByDisplayOrderAscLabelAsc(deliverable.getId());
        if (requested == null || requested.isEmpty()) {
            if (existing.isEmpty()) {
                DeliverableField fallback = legacyField(deliverable, deliverable.isPdfRequired());
                fieldRepository.save(fallback);
                deliverable.setPdfRequired(fallback.getFieldType() == DeliverableFieldType.DRIVE_PDF);
                repository.save(deliverable);
            } else if (!creating) {
                // Older API clients do not know about field definitions. Preserve the existing field model.
                deliverable.setPdfRequired(existing.stream().anyMatch(this::isPdfField));
                repository.save(deliverable);
            }
            return;
        }

        validateFields(requested);
        boolean hasResponses = responseRepository.existsByDeliverableId(deliverable.getId());
        Map<String, DeliverableField> existingById = existing.stream()
            .collect(Collectors.toMap(DeliverableField::getId, item -> item));
        Map<String, DeliverableField> existingByKey = existing.stream()
            .collect(Collectors.toMap(DeliverableField::getFieldKey, item -> item, (first, second) -> first));
        java.util.Set<String> retainedIds = new java.util.HashSet<>();

        for (int index = 0; index < requested.size(); index++) {
            DeliverableFieldRequest item = requested.get(index);
            String requestedId = normalizeNullable(item.id());
            String key = item.fieldKey().trim();
            DeliverableField field = requestedId == null ? null : existingById.get(requestedId);
            if (requestedId != null && field == null) {
                throw new IllegalArgumentException("Submission field ID does not belong to this deliverable.");
            }
            if (field == null) field = existingByKey.get(key);
            if (field == null) {
                field = new DeliverableField(
                    UUID.randomUUID().toString(),
                    deliverable.getId(),
                    key,
                    item.label().trim(),
                    normalizeNullable(item.helpText()),
                    item.fieldType(),
                    item.required(),
                    index,
                    item.documentCheckPolicy(),
                    item.aiReviewEnabled(),
                    item.active()
                );
            } else {
                if (!field.getFieldKey().equals(key)) {
                    throw new IllegalArgumentException("A field key cannot be changed after publication. Rename the label instead.");
                }
                if (hasResponses && field.getFieldType() != item.fieldType()) {
                    throw new IllegalArgumentException(
                        "A submission field type cannot be changed after responses exist. Remove it from the form and add a new field instead.");
                }
                field.update(item.label().trim(), normalizeNullable(item.helpText()), item.fieldType(), item.required(), index,
                    item.documentCheckPolicy(), item.aiReviewEnabled(), item.active());
            }
            retainedIds.add(field.getId());
            fieldRepository.saveAndFlush(field);
            syncOptions(field, item.options(), hasResponses);
        }

        for (DeliverableField old : existing) {
            if (!retainedIds.contains(old.getId()) && old.isActive()) {
                old.update(old.getLabel(), old.getHelpText(), old.getFieldType(), old.isRequired(), old.getDisplayOrder(),
                    old.getDocumentCheckPolicy(), old.isAiReviewEnabled(), false);
                fieldRepository.save(old);
            }
        }
        deliverable.setPdfRequired(requested.stream().anyMatch(item -> item.active() && item.fieldType() == DeliverableFieldType.DRIVE_PDF));
        repository.save(deliverable);
    }

    private void syncOptions(DeliverableField field, List<DeliverableFieldOptionRequest> requested, boolean hasResponses) {
        List<DeliverableFieldOptionRequest> safeRequested = requested == null ? List.of() : requested;
        List<DeliverableFieldOption> existing = optionRepository.findAllByFieldIdOrderByDisplayOrderAscLabelAsc(field.getId());

        if (!field.getFieldType().isChoice()) {
            if (!existing.isEmpty()) {
                if (hasResponses) {
                    throw new IllegalArgumentException(
                        "Choice options cannot be removed from a field after responses exist.");
                }
                optionRepository.deleteAll(existing);
            }
            return;
        }

        Map<String, DeliverableFieldOption> existingById = existing.stream()
            .collect(Collectors.toMap(DeliverableFieldOption::getId, option -> option));
        if (hasResponses) validateCompatibleOptions(existing, safeRequested);
        Set<String> retained = new java.util.HashSet<>();

        for (int index = 0; index < safeRequested.size(); index++) {
            DeliverableFieldOptionRequest item = safeRequested.get(index);
            String requestedId = normalizeNullable(item.id());
            DeliverableFieldOption option = requestedId == null ? null : existingById.get(requestedId);
            if (requestedId != null && option == null) {
                if (optionRepository.existsById(requestedId)) {
                    throw new IllegalArgumentException("Choice option ID does not belong to this field.");
                }
                // Unknown client-local IDs are only draft identities. Persist a server-generated stable ID.
                requestedId = null;
            }
            if (option == null) {
                option = new DeliverableFieldOption(
                    UUID.randomUUID().toString(), field.getId(), item.label().trim(), index);
            } else {
                option.update(item.label().trim(), index);
            }
            retained.add(option.getId());
            optionRepository.save(option);
        }

        if (!hasResponses) {
            List<DeliverableFieldOption> removed = existing.stream()
                .filter(option -> !retained.contains(option.getId()))
                .toList();
            if (!removed.isEmpty()) optionRepository.deleteAll(removed);
        }
    }

    private void validateCompatibleOptions(
        List<DeliverableFieldOption> existing,
        List<DeliverableFieldOptionRequest> requested
    ) {
        Map<String, DeliverableFieldOptionRequest> requestedById = requested.stream()
            .filter(option -> normalizeNullable(option.id()) != null)
            .collect(Collectors.toMap(option -> option.id().trim(), option -> option));
        for (DeliverableFieldOption option : existing) {
            DeliverableFieldOptionRequest next = requestedById.get(option.getId());
            if (next == null || !option.getLabel().equals(next.label().trim())) {
                throw new IllegalArgumentException(
                    "Existing choice option IDs and labels cannot be removed or changed after responses exist.");
            }
        }
    }

    private void validateFields(List<DeliverableFieldRequest> fields) {
        java.util.Set<String> ids = new java.util.HashSet<>();
        java.util.Set<String> keys = new java.util.HashSet<>();
        if (fields.size() > 30) throw new IllegalArgumentException("A form can contain at most 30 submission fields.");
        for (DeliverableFieldRequest field : fields) {
            String id = normalizeNullable(field.id());
            String key = field.fieldKey().trim();
            if (id != null && !ids.add(id)) throw new IllegalArgumentException("Submission field IDs must be unique.");
            if (!keys.add(key.toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("Submission field keys must be unique.");
            boolean pdf = field.fieldType() == DeliverableFieldType.DRIVE_PDF;
            if (!pdf && field.documentCheckPolicy() != DocumentCheckPolicy.OFF) {
                throw new IllegalArgumentException("Document Check is only available for Google Drive PDF fields.");
            }
            if (!pdf && field.aiReviewEnabled()) {
                throw new IllegalArgumentException("AI Review is only available for Google Drive PDF fields.");
            }
            List<DeliverableFieldOptionRequest> options = field.options() == null ? List.of() : field.options();
            if (!field.fieldType().isChoice() && !options.isEmpty()) {
                throw new IllegalArgumentException("Choice options are only allowed for dropdown, multiple-choice, or checkbox fields.");
            }
            if (field.fieldType().isChoice()) {
                if (options.isEmpty()) {
                    throw new IllegalArgumentException("Choice fields require at least one option.");
                }
                Set<String> optionIds = new java.util.HashSet<>();
                Set<String> optionLabels = new java.util.HashSet<>();
                for (DeliverableFieldOptionRequest option : options) {
                    String optionId = normalizeNullable(option.id());
                    if (optionId != null && !optionIds.add(optionId)) {
                        throw new IllegalArgumentException("Choice option IDs must be unique within a field.");
                    }
                    String label = option.label() == null ? "" : option.label().trim();
                    if (label.isBlank()) throw new IllegalArgumentException("Choice option labels cannot be blank.");
                    if (!optionLabels.add(label.toLowerCase(Locale.ROOT))) {
                        throw new IllegalArgumentException("Choice option labels must be unique within a field.");
                    }
                }
            }
        }
    }

    private boolean isPdfField(DeliverableField field) {
        return field.isActive() && field.getFieldType() == DeliverableFieldType.DRIVE_PDF;
    }

    private DeliverableField legacyField(Deliverable deliverable, boolean pdfRequired) {
        return new DeliverableField(
            deliverable.getId() + ":legacy",
            deliverable.getId(),
            pdfRequired ? "documentPdf" : "primaryLink",
            pdfRequired ? "PDF Drive Link" : "Submission Link",
            pdfRequired ? DeliverableFieldType.DRIVE_PDF : DeliverableFieldType.GENERAL_URL,
            true,
            0,
            pdfRequired ? DocumentCheckPolicy.AUTO : DocumentCheckPolicy.OFF,
            pdfRequired,
            true
        );
    }

    private Deliverable findRequired(UUID workspaceId, UUID id) {
        return repository.findById(id)
            .filter(deliverable -> deliverable.getWorkspaceId().equals(workspaceId))
            .orElseThrow(() -> new IllegalArgumentException("Deliverable was not found."));
    }

    static String normalizeSlug(String requestedSlug, String title) {
        String source = normalizeNullable(requestedSlug);
        String slug = source == null ? title : source;
        String normalized = slug
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-|-$)", "");
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("Slug must contain at least one letter or number.");
        }
        return normalized;
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
