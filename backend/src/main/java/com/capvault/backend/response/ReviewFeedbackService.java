package com.capvault.backend.response;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.staff.AdviserTeamAssignmentRepository;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewFeedbackService {

    private final FormResponseRepository responseRepository;
    private final ResponseFeedbackRepository feedbackRepository;
    private final ResponseAcceptanceRepository acceptanceRepository;
    private final AdviserTeamAssignmentRepository adviserTeamRepository;
    private final Clock clock;
    private final DomainEventRecorder events;
    private final CanonicalResponseService canonical;
    private final AcceptedPdfSnapshotService acceptedPdfSnapshots;
    private final com.capvault.backend.archive.ArchiveRecordRepository archives;
    private final StaffRoleAssignmentRepository staffRoles;

    public ReviewFeedbackService(
        FormResponseRepository responseRepository,
        ResponseFeedbackRepository feedbackRepository,
        ResponseAcceptanceRepository acceptanceRepository,
        AdviserTeamAssignmentRepository adviserTeamRepository,
        Clock clock,
        DomainEventRecorder events,
        CanonicalResponseService canonical,
        AcceptedPdfSnapshotService acceptedPdfSnapshots,
        com.capvault.backend.archive.ArchiveRecordRepository archives,
        StaffRoleAssignmentRepository staffRoles
    ) {
        this.responseRepository = responseRepository;
        this.feedbackRepository = feedbackRepository;
        this.acceptanceRepository = acceptanceRepository;
        this.adviserTeamRepository = adviserTeamRepository;
        this.clock = clock;
        this.events = events;
        this.canonical = canonical;
        this.acceptedPdfSnapshots = acceptedPdfSnapshots;
        this.archives = archives;
        this.staffRoles = staffRoles;
    }

    /** Staff can create or update ONE current student-visible note per response (edits in place). */
    @Transactional
    public ResponseFeedback saveFeedback(UUID responseId, String subject, String email, String role,
                                         String note, String visibility) {
        FormResponse response = responseRepository.findById(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Response not found."));
        if (!role.equals("ADMIN") && !role.equals("ADVISER")) {
            throw new org.springframework.security.access.AccessDeniedException("Staff authorization required.");
        }
        requireTeamAccess(response, subject, role, "comment on");
        response.requireCurrent();
        events.record(response.getWorkspaceId(), responseId, subject, "FEEDBACK_SAVED",
            java.util.Map.of("role", role, "note", note, "visibility", visibility));
        Instant now = clock.instant();
        Optional<ResponseFeedback> existing = feedbackRepository.findByResponseIdAndAuthorSubject(responseId, subject);
        if (existing.isPresent()) {
            ResponseFeedback feedback = existing.get();
            feedback.setNote(note);
            feedback.setVisibility(visibility);
            feedback.setUpdatedAt(now);
            return feedbackRepository.save(feedback);
        }
        return feedbackRepository.save(new ResponseFeedback(
            UUID.randomUUID(), response, subject, email, role, note, visibility, now, now));
    }

    /**
     * Accept: Admin across all workspaces; Adviser only for teams assigned to them.
     * Acceptance records the response's updated_at so later material edits can invalidate freshness.
     */
    @Transactional
    public ResponseAcceptance accept(UUID responseId, String subject, String email, String role) {
        FormResponse response = responseRepository.findByIdForUpdate(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Response not found."));
        requireTeamAccess(response, subject, role, "accept");
        response.requireCurrent();
        events.record(response.getWorkspaceId(), responseId, subject, "RESPONSE_ACCEPTED",
            java.util.Map.of("role", role, "revision", response.getRevision()));
        canonical.recordAcceptanceIfFirst(response, subject);
        String sourceArtifacts = acceptedPdfSnapshots.capture(response);
        Instant now = clock.instant();
        var existing = acceptanceRepository.findByResponseId(responseId);
        if (existing.isPresent()) {
            ResponseAcceptance acceptance = existing.get();
            acceptance.reactivate(subject, email, role, response.getUpdatedAt(), now);
            acceptance.setSourceArtifactsJson(sourceArtifacts);
            return acceptanceRepository.save(acceptance);
        }
        ResponseAcceptance acceptance = new ResponseAcceptance(
            UUID.randomUUID(), response, subject, email, role,
            response.getUpdatedAt(), now);
        acceptance.setSourceArtifactsJson(sourceArtifacts);
        return acceptanceRepository.save(acceptance);
    }

    /**
     * Ticket 06 follow-up: every staff mutation on a single response is scoped the same way as
     * the staff queue, so an adviser cannot reach an unassigned team by calling the API directly.
     * ADMIN passes through; an ADVISER must own the response's team in that workspace.
     */
    @Transactional(readOnly = true)
    public void requireStaffTeamAccess(UUID responseId, String subject, String role) {
        FormResponse response = responseRepository.findById(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Response not found."));
        requireTeamAccess(response, subject, role, "read or change");
    }

    /** True when the session owns this response, which lets a student read their own feedback. */
    @Transactional(readOnly = true)
    public boolean isOwnedBy(UUID responseId, String subject) {
        return responseRepository.findById(responseId)
            .map(response -> response.getGoogleSubject().equals(subject))
            .orElse(false);
    }

    private void requireTeamAccess(FormResponse response, String subject, String role, String verb) {
        if ("ADMIN".equals(role)) return;
        boolean assignedToThisTeam = adviserTeamRepository
            .findAllByGoogleSubjectAndWorkspaceId(subject, response.getWorkspaceId()).stream()
            .anyMatch(a -> a.getTeamCode().equalsIgnoreCase(response.getTeamCode()));
        if (!assignedToThisTeam) {
            throw new org.springframework.security.access.AccessDeniedException(
                "Advisers may only " + verb + " responses for their assigned teams.");
        }
    }

    @Transactional
    public void revoke(UUID responseId) {
        responseRepository.findByIdForUpdate(responseId).orElseThrow(() -> new IllegalArgumentException("Response not found."));
        requireUnarchived(responseId);
        acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId)
            .ifPresent(acceptance -> {
                acceptance.setRevokedAt(clock.instant());
                acceptanceRepository.save(acceptance);
            });
    }

    @Transactional
    public void revoke(UUID responseId, String subject, String role) {
        var response = responseRepository.findByIdForUpdate(responseId).orElseThrow(() -> new IllegalArgumentException("Response not found."));
        requireTeamAccess(response, subject, role, "revoke");
        requireUnarchived(responseId);
        if (acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId).isPresent()) {
            events.record(response.getWorkspaceId(), responseId, subject, "ACCEPTANCE_REVOKED", java.util.Map.of("role", role));
            revoke(responseId);
        }
    }

    private void requireUnarchived(UUID responseId) {
        if (archives.existsByResponseIdAndActiveTrue(responseId)) {
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                "This response is archived. Open Archive and choose Unarchive with Also revoke acceptance.");
        }
    }

    @Transactional(readOnly = true)
    public List<ResponseFeedback> feedbackFor(UUID responseId) {
        return feedbackRepository.findAllByResponseIdOrderByUpdatedAtDesc(responseId);
    }

    /** Call only after checking that the requesting student owns the response. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> studentFeedbackFor(UUID responseId) {
        return feedbackFor(responseId).stream()
            .filter(ResponseFeedback::isStudentVisible)
            .map(item -> Map.<String, Object>of("note", item.getNote(), "visibility", item.getVisibility(),
                "authorName", studentFeedbackAuthorName(item), "authorRole", item.getAuthorRole(),
                "updatedAt", item.getUpdatedAt().toString()))
            .toList();
    }

    /** Call only after checking that the requesting student owns the response. */
    @Transactional(readOnly = true)
    public Map<String, Object> studentStateFor(UUID responseId, Instant responseUpdatedAt) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("feedback", studentFeedbackFor(responseId));
        activeAcceptance(responseId)
            .filter(item -> responseUpdatedAt == null || item.getSourceResponseUpdatedAt().equals(responseUpdatedAt))
            .ifPresent(item -> state.put("acceptance", Map.of("acceptedAt", item.getAcceptedAt().toString(),
                "acceptedByRole", item.getAcceptedByRole(),
                "sourceResponseUpdatedAt", item.getSourceResponseUpdatedAt().toString())));
        return state;
    }

    private String studentFeedbackAuthorName(ResponseFeedback feedback) {
        StaffRole role = "ADVISER".equalsIgnoreCase(feedback.getAuthorRole()) ? StaffRole.ADVISER : StaffRole.ADMIN;
        return staffRoles.findByGoogleSubjectAndRole(feedback.getAuthorSubject(), role)
            .map(StaffRoleAssignment::getAdviserName)
            .map(String::trim)
            .filter(name -> !name.isEmpty() && !name.contains("@"))
            .orElse(role == StaffRole.ADVISER ? "Adviser" : "Staff");
    }

    /** Call only with response IDs already authorized by the owning controller. */
    @Transactional(readOnly = true)
    public java.util.Map<UUID, java.util.Map<String, Object>> statesFor(List<UUID> ids) {
        java.util.Map<UUID, java.util.Map<String, Object>> states = new java.util.LinkedHashMap<>();
        if (ids.isEmpty()) return states;
        ids.forEach(id -> {
            var state = new java.util.LinkedHashMap<String, Object>();
            state.put("feedback", new java.util.ArrayList<java.util.Map<String, Object>>());
            states.put(id, state);
        });
        var feedback = feedbackRepository.findAllByResponseIdInOrderByUpdatedAtDesc(ids).stream()
            .collect(java.util.stream.Collectors.groupingBy(f -> f.getResponse().getId()));
        feedback.forEach((id, items) -> states.get(id).put("feedback", items.stream().map(f ->
            java.util.Map.<String, Object>of("note", f.getNote(), "visibility", f.getVisibility(),
                "author", f.getAuthorEmail(), "authorRole", f.getAuthorRole(), "updatedAt", f.getUpdatedAt().toString())).toList()));
        acceptanceRepository.findAllByResponseIdInAndRevokedAtIsNull(ids).forEach(a ->
            states.get(a.getResponse().getId()).put("acceptance", java.util.Map.of(
                "acceptedAt", a.getAcceptedAt().toString(), "acceptedBy", a.getAcceptedByEmail(),
                "acceptedByRole", a.getAcceptedByRole(), "sourceResponseUpdatedAt", a.getSourceResponseUpdatedAt().toString())));
        return states;
    }

    /** Call only with response IDs already authorized by the owning controller. */
    @Transactional(readOnly = true)
    public java.util.Map<UUID, Instant> activeAcceptanceVersionsFor(List<UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return acceptanceRepository.findAllByResponseIdInAndRevokedAtIsNull(ids).stream()
            .collect(java.util.stream.Collectors.toMap(
                acceptance -> acceptance.getResponse().getId(),
                ResponseAcceptance::getSourceResponseUpdatedAt));
    }

    @Transactional(readOnly = true)
    public java.util.Map<UUID, Instant> activeAcceptanceTimesFor(List<UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return acceptanceRepository.findAllByResponseIdInAndRevokedAtIsNull(ids).stream()
            .collect(java.util.stream.Collectors.toMap(a -> a.getResponse().getId(),ResponseAcceptance::getAcceptedAt));
    }

    @Transactional(readOnly = true)
    public Optional<ResponseAcceptance> activeAcceptance(UUID responseId) {
        return acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId);
    }
}
