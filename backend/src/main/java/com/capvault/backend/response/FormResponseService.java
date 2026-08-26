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
import java.util.stream.Collectors;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.capvault.backend.deliverable.Deliverable;
import com.capvault.backend.deliverable.DeliverableRepository;
import com.capvault.backend.deliverable.DeliverableStatus;
import com.capvault.backend.student.StudentAssociationService;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FormResponseService {

    private final FormResponseRepository responseRepository;
    private final FormResponseVersionRepository versionRepository;
    private final StudentAssociationService associationService;
    private final DeliverableRepository deliverableRepository;
    private final Clock clock;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FormResponseService(
        FormResponseRepository responseRepository,
        FormResponseVersionRepository versionRepository,
        StudentAssociationService associationService,
        DeliverableRepository deliverableRepository,
        Clock clock
    ) {
        this.responseRepository = responseRepository;
        this.versionRepository = versionRepository;
        this.associationService = associationService;
        this.deliverableRepository = deliverableRepository;
        this.clock = clock;
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
        Map<String, Object> values
    ) {
    }

    @Transactional
    public SaveResult submit(SubmitCommand command) {
        Deliverable deliverable = deliverableRepository.findById(command.deliverableId())
            .orElseThrow(() -> new IllegalArgumentException("Deliverable not found."));
        if (deliverable.getStatus() != DeliverableStatus.PUBLISHED) {
            throw new IllegalStateException("This form is no longer accepting responses.");
        }
        Instant now = clock.instant();
        Optional<FormResponse> existing = responseRepository
            .findByWorkspaceIdAndDeliverableIdAndGoogleSubject(command.workspaceId(), command.deliverableId(), command.googleSubject());

        if (existing.isPresent()) {
            FormResponse response = existing.get();
            String currentJson = response.getValuesJson();
            String nextJson = toJson(command.values());
            if (currentJson.equals(nextJson)) {
                return new SaveResult(false, response, response.getRevision()); // identical resave: untouched
            }
            archiveVersion(response);
            response.setValuesJson(nextJson);
            response.setUpdatedAt(now);
            // revision increments via @Version on flush; keep client-visible in sync:
            try {
                responseRepository.saveAndFlush(response);
            } catch (OptimisticLockingFailureException e) {
                throw new ConcurrentModificationException();
            }
            return new SaveResult(true, response, response.getRevision());
        }

        // First submission: require an active association (ticket 03) and snapshot the roster record.
        StudentAssociationService.AssociationView association = associationService
            .activeAssociation(command.workspaceId(), command.googleSubject())
            .orElseThrow(() -> new IllegalStateException("Connect your Student Record before submitting."));
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
            toJson(command.values()),
            now,
            now
        );
        created = responseRepository.save(created);
        return new SaveResult(true, created, created.getRevision());
    }

    /** Ownership is the Google subject: another identity can never read or overwrite these values. */
    @Transactional(readOnly = true)
    public Optional<FormResponse> ownedResponse(UUID workspaceId, UUID deliverableId, String googleSubject) {
        if (googleSubject == null || googleSubject.isBlank()) return Optional.empty();
        return responseRepository.findByWorkspaceIdAndDeliverableIdAndGoogleSubject(workspaceId, deliverableId, googleSubject);
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

    private void archiveVersion(FormResponse response) {
        versionRepository.save(new FormResponseVersion(
            UUID.randomUUID(), response, response.getValuesJson(), response.getRevision(), clock.instant()));
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
