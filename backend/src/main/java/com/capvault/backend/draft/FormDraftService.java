package com.capvault.backend.draft;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.response.FormResponse;
import com.capvault.backend.response.FormResponseRepository;
import com.capvault.backend.student.StudentAssociationService;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FormDraftService {

    private final FormResponseDraftRepository draftRepository;
    private final FormResponseRepository responseRepository;
    private final StudentAssociationService associationService;
    private final Clock clock;
    private final Duration retention;

    public FormDraftService(
        FormResponseDraftRepository draftRepository,
        FormResponseRepository responseRepository,
        StudentAssociationService associationService,
        Clock clock
    ) {
        this.draftRepository = draftRepository;
        this.responseRepository = responseRepository;
        this.associationService = associationService;
        this.clock = clock;
        this.retention = Duration.ofDays(14);
    }

    public record DraftState(
        boolean present,
        Map<String, Object> values,
        long revision,
        boolean completed,
        String updatedAt
    ) {
    }

    @Transactional
    public DraftState save(UUID workspaceId, UUID deliverableId, String googleSubject, Map<String, Object> values, Long clientRevision) {
        requireExistingResponseAccess(workspaceId, deliverableId, googleSubject);
        Instant now = clock.instant();
        Optional<FormResponseDraft> existing = draftRepository
            .findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, googleSubject);

        if (existing.filter(d -> d.isCompleted() || d.getExpiresAt().isBefore(now)).isPresent()) {
            existing.ifPresent(d -> {
                if (d.isCompleted()) return; // completed drafts are kept as markers, not reused
            });
        }
        // Expired or absent: treat as fresh. Completed: never resurrect (submission supersedes).
        boolean blocked = existing.map(d -> d.isCompleted()).orElse(false);

        String json = toJson(values);
        if (blocked) {
            return new DraftState(false, null, 0L, true, now.toString());
        }

        if (existing.isPresent() && !existing.get().isCompleted()) {
            FormResponseDraft draft = existing.get();
            if (clientRevision != null && clientRevision != draft.getRevision()) {
                throw new StaleRevisionException();
            }
            boolean materialChange = !draft.getValuesJson().equals(json);
            if (!materialChange) {
                return toState(draft);
            }
            draft.setValuesJson(json);
            draft.setUpdatedAt(now);
            draft = draftRepository.saveAndFlush(draft); // revision bumps via @Version
            return toState(draft);
        }

        FormResponseDraft created = draftRepository.save(new FormResponseDraft(
            UUID.randomUUID(), workspaceId, deliverableId, googleSubject,
            json, false, now.plus(retention), now));
        return toState(created);
    }

    /** Autosave restore: only when no newer submitted response takes precedence. */
    @Transactional(readOnly = true)
    public Optional<DraftState> restore(UUID workspaceId, UUID deliverableId, String googleSubject) {
        if (!hasExistingResponseAccess(workspaceId, deliverableId, googleSubject)) return Optional.empty();
        Instant now = clock.instant();
        Optional<FormResponseDraft> draft = draftRepository
            .findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, googleSubject)
            .filter(d -> !d.isCompleted())
            .filter(d -> d.getExpiresAt().isAfter(now));
        return draft.map(this::toState);
    }

    /** Deliberate clear with confirmation happens in UI; this just performs it. */
    @Transactional
    public void clear(UUID workspaceId, UUID deliverableId, String googleSubject) {
        requireExistingResponseAccess(workspaceId, deliverableId, googleSubject);
        draftRepository.findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, googleSubject)
            .ifPresent(draftRepository::delete);
    }

    /** Submission transition: mark related draft completed without deleting the submitted response. */
    @Transactional
    public void markCompleted(UUID workspaceId, UUID deliverableId, String googleSubject) {
        draftRepository.findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, googleSubject)
            .ifPresent(draft -> {
                draft.setCompleted(true);
                draft.setUpdatedAt(clock.instant());
                draftRepository.save(draft);
            });
    }

    /** Repeat-safe cleanup of expired drafts. */
    @Transactional
    public int purgeExpired() {
        return draftRepository.deleteAllExpired(clock.instant());
    }

    /**
     * Before the first successful submission there is no response to protect, so anonymous-to-
     * WildTrack draft autosave remains allowed for a signed-in Google subject. Once a response
     * exists, the subject must still hold the active association for that response's Student Record.
     */
    private boolean hasExistingResponseAccess(UUID workspaceId, UUID deliverableId, String googleSubject) {
        Optional<FormResponse> response = responseRepository
            .findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, googleSubject);
        if (response.isEmpty()) return true;
        return associationService.activeAssociation(workspaceId, googleSubject)
            .map(association -> association.studentRecordId().equals(response.get().getStudentRecordId()))
            .orElse(false);
    }

    private void requireExistingResponseAccess(UUID workspaceId, UUID deliverableId, String googleSubject) {
        if (!hasExistingResponseAccess(workspaceId, deliverableId, googleSubject)) {
            throw new AccessDeniedException(
                "This account is no longer associated with the Student Number for the saved response.");
        }
    }

    private DraftState toState(FormResponseDraft draft) {
        return new DraftState(true, fromJson(draft.getValuesJson()), draft.getRevision(), draft.isCompleted(), draft.getUpdatedAt().toString());
    }

    private String toJson(Map<String, Object> values) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(values);
        } catch (Exception e) {
            throw new IllegalArgumentException("Draft values could not be serialized.", e);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fromJson(String json) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("Stored draft could not be read.", e);
        }
    }

    public static class StaleRevisionException extends RuntimeException {
        public StaleRevisionException() {
            super("This draft was updated in another session.");
        }
    }
}
