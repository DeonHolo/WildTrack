package com.capvault.backend.response;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CanonicalResponseService {

    private final CanonicalResponseSelectionRepository selectionRepository;
    private final FormResponseRepository responseRepository;

    private final Clock clock;

    public CanonicalResponseService(
        CanonicalResponseSelectionRepository selectionRepository,
        FormResponseRepository responseRepository,
        Clock clock
    ) {
        this.selectionRepository = selectionRepository;
        this.responseRepository = responseRepository;
        this.clock = clock;
    }

    /**
     * The first accepted eligible response for a (workspace, deliverable) becomes the canonical
     * tracker source. Later conflicting responses never silently replace it.
     */
    @Transactional
    public void recordAcceptanceIfFirst(FormResponse response, String acceptingSubject) {
        boolean alreadySelected = selectionRepository.findFirstByWorkspaceIdAndDeliverableIdAndStudentRecordIdOrderByCreatedAtDesc(
            response.getWorkspaceId(), response.getDeliverableId(), response.getStudentRecordId()).isPresent();
        if (!alreadySelected) {
            selectionRepository.save(new CanonicalResponseSelection(
                UUID.randomUUID(),
                response.getWorkspaceId(),
                response.getStudentRecordId(),
                response.getDeliverableId(),
                response.getId(),
                acceptingSubject,
                "First acceptance",
                null,
                clock.instant()
            ));
        }
    }

    /** Explicit Admin correction with a full audit trail. */
    @Transactional
    public CanonicalResponseSelection selectCanonical(UUID workspaceId, UUID deliverableId, UUID studentRecordId,
                                                      UUID newResponseId, String adminSubject, String reason) {
        FormResponse target = responseRepository.findById(newResponseId)
            .orElseThrow(() -> new IllegalArgumentException("Target response does not exist."));
        if (!target.getWorkspaceId().equals(workspaceId)) {
            throw new IllegalArgumentException("Response belongs to a different workspace.");
        }
        Optional<CanonicalResponseSelection> previous = selectionRepository
            .findFirstByWorkspaceIdAndDeliverableIdAndStudentRecordIdOrderByCreatedAtDesc(workspaceId, deliverableId, studentRecordId);
        return selectionRepository.save(new CanonicalResponseSelection(
            UUID.randomUUID(),
            workspaceId,
            studentRecordId,
            deliverableId,
            newResponseId,
            adminSubject,
            reason == null ? "" : reason,
            previous.map(CanonicalResponseSelection::getCanonicalResponseId).orElse(null),
            clock.instant()
        ));
    }

    @Transactional(readOnly = true)
    public Optional<UUID> canonicalResponseId(UUID workspaceId, UUID deliverableId, UUID studentRecordId) {
        return selectionRepository
            .findFirstByWorkspaceIdAndDeliverableIdAndStudentRecordIdOrderByCreatedAtDesc(workspaceId, deliverableId, studentRecordId)
            .map(CanonicalResponseSelection::getCanonicalResponseId);
    }

    @Transactional(readOnly = true)
    public List<CanonicalResponseSelection> correctionHistory(UUID workspaceId, UUID deliverableId, UUID studentRecordId) {
        // Full audit history: all selections newest-first is derivable from the table; expose via repo later if needed.
        return List.of(); // placeholder until a findAll query is needed by UI
    }
}
