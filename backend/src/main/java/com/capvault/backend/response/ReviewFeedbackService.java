package com.capvault.backend.response;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.staff.AdviserTeamAssignmentRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReviewFeedbackService {

    private final FormResponseRepository responseRepository;
    private final ResponseFeedbackRepository feedbackRepository;
    private final ResponseAcceptanceRepository acceptanceRepository;
    private final AdviserTeamAssignmentRepository adviserTeamRepository;
    private final Clock clock;

    public ReviewFeedbackService(
        FormResponseRepository responseRepository,
        ResponseFeedbackRepository feedbackRepository,
        ResponseAcceptanceRepository acceptanceRepository,
        AdviserTeamAssignmentRepository adviserTeamRepository,
        Clock clock
    ) {
        this.responseRepository = responseRepository;
        this.feedbackRepository = feedbackRepository;
        this.acceptanceRepository = acceptanceRepository;
        this.adviserTeamRepository = adviserTeamRepository;
        this.clock = clock;
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
        FormResponse response = responseRepository.findById(responseId)
            .orElseThrow(() -> new IllegalArgumentException("Response not found."));
        requireTeamAccess(response, subject, role, "accept");
        Instant now = clock.instant();
        // Replace any prior acceptance row for the same response (re-accept after revoke).
        acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId)
            .ifPresent(prior -> {
                prior.setRevokedAt(now);
                acceptanceRepository.save(prior);
            });
        return acceptanceRepository.save(new ResponseAcceptance(
            UUID.randomUUID(), response, subject, email, role,
            response.getUpdatedAt(), now));
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
        acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId)
            .ifPresent(acceptance -> {
                acceptance.setRevokedAt(clock.instant());
                acceptanceRepository.save(acceptance);
            });
    }

    @Transactional(readOnly = true)
    public List<ResponseFeedback> feedbackFor(UUID responseId) {
        return feedbackRepository.findAllByResponseIdOrderByUpdatedAtDesc(responseId);
    }

    @Transactional(readOnly = true)
    public Optional<ResponseAcceptance> activeAcceptance(UUID responseId) {
        return acceptanceRepository.findByResponseIdAndRevokedAtIsNull(responseId);
    }
}
