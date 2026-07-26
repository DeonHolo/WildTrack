package com.capvault.backend.deliverable;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliverableService {

    private final DeliverableRepository repository;

    public DeliverableService(DeliverableRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<DeliverableResponse> listDeliverables(UUID workspaceId) {
        return repository.findAllByWorkspaceIdOrderByDueAtAscTitleAsc(workspaceId)
            .stream()
            .map(DeliverableResponse::from)
            .toList();
    }

    @Transactional(readOnly = true)
    public DeliverableResponse getDeliverable(UUID workspaceId, UUID id) {
        return DeliverableResponse.from(findRequired(workspaceId, id));
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

        return DeliverableResponse.from(repository.save(deliverable));
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
        deliverable.setPdfRequired(request.pdfRequired());
        deliverable.setStatus(request.status() == null ? DeliverableStatus.PUBLISHED : request.status());

        return DeliverableResponse.from(repository.save(deliverable));
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
