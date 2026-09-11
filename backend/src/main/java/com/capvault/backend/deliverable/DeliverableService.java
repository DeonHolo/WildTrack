package com.capvault.backend.deliverable;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DeliverableService {

    private final DeliverableRepository repository;
    private final DeliverableFieldRepository fieldRepository;

    public DeliverableService(DeliverableRepository repository, DeliverableFieldRepository fieldRepository) {
        this.repository = repository;
        this.fieldRepository = fieldRepository;
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
        return response(deliverable);
    }

    @Transactional
    public DeliverableResponse updateDeliverable(UUID workspaceId, UUID id, DeliverableRequest request) {
        Deliverable deliverable = findRequired(workspaceId, id);
        String title = request.title().trim();
        String slug = normalizeSlug(request.slug(), title);
        if (repository.existsByWorkspaceIdAndSlugAndIdNot(workspaceId, slug, id)) {
            throw new IllegalArgumentException("A deliverable with this slug already exists.");
        }

        deliverable.setTrackerColumnKey(request.trackerColumnKey().trim());
        deliverable.setTitle(title);
        deliverable.setSlug(slug);
        deliverable.setInstructions(normalizeNullable(request.instructions()));
        deliverable.setDueAt(request.dueAt());
        deliverable.setStatus(request.status() == null ? DeliverableStatus.PUBLISHED : request.status());
        deliverable = repository.saveAndFlush(deliverable);
        saveFields(deliverable, request.fields(), false);
        return response(deliverable);
    }

    @Transactional
    public List<DeliverableResponse> unpublishAll(UUID workspaceId) {
        List<Deliverable> deliverables = repository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId);
        List<Deliverable> changed = deliverables.stream()
            .filter(deliverable -> deliverable.getStatus() == DeliverableStatus.PUBLISHED)
            .peek(deliverable -> deliverable.setStatus(DeliverableStatus.UNPUBLISHED))
            .toList();
        if (!changed.isEmpty()) repository.saveAll(changed);
        return deliverables.stream().map(this::response).toList();
    }

    private DeliverableResponse response(Deliverable deliverable) {
        List<DeliverableField> fields = activeOrLegacyFields(deliverable);
        return DeliverableResponse.from(deliverable, fields);
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
                field.update(item.label().trim(), item.fieldType(), item.required(), index,
                    item.documentCheckPolicy(), item.aiReviewEnabled(), item.active());
            }
            retainedIds.add(field.getId());
            fieldRepository.save(field);
        }

        for (DeliverableField old : existing) {
            if (!retainedIds.contains(old.getId()) && old.isActive()) {
                old.update(old.getLabel(), old.getFieldType(), old.isRequired(), old.getDisplayOrder(),
                    old.getDocumentCheckPolicy(), old.isAiReviewEnabled(), false);
                fieldRepository.save(old);
            }
        }
        deliverable.setPdfRequired(requested.stream().anyMatch(item -> item.active() && item.fieldType() == DeliverableFieldType.DRIVE_PDF));
        repository.save(deliverable);
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
            if (field.aiReviewEnabled() && field.documentCheckPolicy() == DocumentCheckPolicy.OFF) {
                throw new IllegalArgumentException("AI Review requires Document Check to be enabled for that PDF field.");
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
