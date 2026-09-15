package com.capvault.backend.student;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StudentAssociationService {

    public static final String ASSURANCE_SELF_DECLARED = "SELF_DECLARED";
    public static final String CONFLICT_OPEN = "OPEN";
    public static final String CONFLICT_RESOLVED = "RESOLVED";
    public static final String CONFLICT_DISMISSED = "DISMISSED";

    private final WorkspaceStudentAssociationRepository associationRepository;
    private final StudentIdentityConflictRepository conflictRepository;
    private final StudentRecordRepository studentRecordRepository;
    private final Clock clock;
    private final com.capvault.backend.response.DomainEventRecorder events;

    public StudentAssociationService(
        WorkspaceStudentAssociationRepository associationRepository,
        StudentIdentityConflictRepository conflictRepository,
        StudentRecordRepository studentRecordRepository,
        Clock clock,
        com.capvault.backend.response.DomainEventRecorder events
    ) {
        this.associationRepository = associationRepository;
        this.conflictRepository = conflictRepository;
        this.studentRecordRepository = studentRecordRepository;
        this.clock = clock;
        this.events = events;
    }

    public record AssociationView(
        UUID id,
        UUID workspaceId,
        String googleEmail,
        UUID studentRecordId,
        String studentNumber,
        String studentName,
        String teamCode,
        String assuranceLevel
    ) {
    }

    /** One competing Google identity, as staff need to see it in the conflict queue. */
    public record ConflictIdentity(
        String googleSubject,
        String googleEmail,
        boolean active,
        Instant connectedAt
    ) {
    }

    /** A conflict with the Student Record it touches and both competing identities. */
    public record ConflictDetail(
        UUID id,
        UUID studentRecordId,
        String studentNumber,
        String studentName,
        String teamCode,
        String status,
        Instant createdAt,
        ConflictIdentity existingIdentity,
        ConflictIdentity conflictingIdentity,
        Instant decidedAt,
        String decidedBySubject,
        String decidedByEmail,
        String decisionNote
    ) {
    }

    @Transactional(readOnly = true)
    public Optional<AssociationView> activeAssociation(UUID workspaceId, String googleSubject) {
        return associationRepository.findByWorkspaceIdAndGoogleSubjectAndActiveTrue(workspaceId, googleSubject)
            .flatMap(this::toView);
    }

    /** Searchable roster options scoped strictly to one workspace; powers the three selectors. */
    @Transactional(readOnly = true)
    public List<StudentRecordResponse> workspaceRosterOptions(UUID workspaceId) {
        return studentRecordRepository.findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId)
            .stream()
            .filter(StudentRecord::isCurrentActive)
            .map(StudentRecordResponse::from)
            .toList();
    }

    /**
     * Confirms the selection: creates a SELF_DECLARED workspace-scoped association.
     * If the same Student Record is already actively associated with a DIFFERENT Google
     * identity in this workspace, the new identity still gets its own association and
     * the collision is recorded for staff review (ticket 03: duplicate associations allowed).
     */
    @Transactional
    public AssociationView confirmAssociation(UUID workspaceId, String googleSubject, String googleEmail, String studentNumber) {
        StudentRecord record = studentRecordRepository
            .findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, studentNumber)
            .orElseThrow(() -> new IllegalArgumentException("No Student Record with that number exists in this workspace."));
        if (!record.isCurrentActive()) {
            throw new IllegalArgumentException("That Student Record is not part of the current Tracker roster.");
        }

        Optional<WorkspaceStudentAssociation> existing =
            associationRepository.findByWorkspaceIdAndGoogleSubject(workspaceId, googleSubject);
        Optional<WorkspaceStudentAssociation> existingActive = existing.filter(WorkspaceStudentAssociation::isActive);

        if (existingActive.isPresent() && existingActive.get().getStudentRecordId().equals(record.getId())) {
            // Idempotent re-confirm: no-op returning current view
            return toView(existingActive.get()).orElseThrow();
        }

        Instant now = clock.instant();
        UUID previousRecordId = existingActive
            .map(WorkspaceStudentAssociation::getStudentRecordId)
            .filter(id -> !id.equals(record.getId()))
            .orElse(null);
        var otherHolders = associationRepository
            .findAllByWorkspaceIdAndStudentRecordIdAndActiveTrueOrderByUpdatedAtDesc(workspaceId, record.getId())
            .stream()
            .filter(association -> !association.getGoogleSubject().equals(googleSubject))
            .toList();
        boolean otherIdentityHoldsRecord = !otherHolders.isEmpty();

        // One row per (workspace, subject): update or reactivate instead of inserting duplicates.
        WorkspaceStudentAssociation saved = existing
            .map(association -> {
                association.setActive(true);
                association.setStudentRecordId(record.getId());
                association.setStudentNumber(record.getStudentNumber());
                association.setUpdatedAt(now);
                return associationRepository.save(association);
            })
            .orElseGet(() -> associationRepository.save(new WorkspaceStudentAssociation(
                UUID.randomUUID(),
                workspaceId,
                googleSubject,
                googleEmail,
                record.getId(),
                record.getStudentNumber(),
                ASSURANCE_SELF_DECLARED,
                true,
                now,
                now
            )));
        ensureOpenConflicts(workspaceId, record.getId(), googleSubject, otherHolders, now);
        if (previousRecordId != null) {
            closeConflictsForDisconnectedIdentity(workspaceId, previousRecordId, googleSubject, googleEmail,
                googleSubject, googleEmail, now, "REASSOCIATED");
        }
        events.record(workspaceId, saved.getId(), googleSubject, "ASSOCIATION_CONFIRMED",
            java.util.Map.of("studentRecordId", record.getId(), "assurance", ASSURANCE_SELF_DECLARED, "identityConflict", otherIdentityHoldsRecord));
        return toView(saved).orElseThrow();
    }

    /** The Admin queue: open conflicts only, each carrying its record and both identities. */
    @Transactional(readOnly = true)
    public List<ConflictDetail> openConflictDetails(UUID workspaceId) {
        return conflictRepository.findAllByWorkspaceIdAndStatusOrderByCreatedAtDesc(workspaceId, CONFLICT_OPEN)
            .stream()
            .map(this::toDetail)
            .toList();
    }

    @Transactional(readOnly = true)
    public List<ConflictDetail> conflictHistory(UUID workspaceId) {
        return conflictRepository.findAllByWorkspaceIdOrderByCreatedAtDesc(workspaceId).stream().map(this::toDetail).toList();
    }

    /**
     * Persists the staff decision on one conflict. RESOLVED means the record's rightful owner
     * was confirmed; DISMISSED means the collision was not a real problem. Either way the
     * conflict leaves the open queue and keeps who decided, when, and why.
     */
    @Transactional
    public ConflictDetail decideConflict(UUID workspaceId, UUID conflictId, String decision,
                                         String decidedBySubject, String decidedByEmail, String note) {
        return decideConflict(workspaceId, conflictId, decision, decidedBySubject, decidedByEmail, note, null);
    }

    @Transactional
    public ConflictDetail decideConflict(UUID workspaceId, UUID conflictId, String decision,
            String decidedBySubject, String decidedByEmail, String note, String confirmedSubject) {
        String normalized = decision == null ? "" : decision.trim().toUpperCase();
        if (!CONFLICT_RESOLVED.equals(normalized) && !CONFLICT_DISMISSED.equals(normalized)) {
            throw new IllegalArgumentException("Decision must be RESOLVED or DISMISSED.");
        }
        if (CONFLICT_RESOLVED.equals(normalized) && (confirmedSubject == null || confirmedSubject.isBlank())) {
            throw new IllegalArgumentException("Choose the correct account before resolving this conflict.");
        }
        StudentIdentityConflict conflict = conflictRepository.findForDecision(conflictId)
            .filter(candidate -> candidate.getWorkspaceId().equals(workspaceId))
            .orElseThrow(() -> new IllegalArgumentException("No identity conflict with that id exists in this workspace."));

        String trimmedNote = note == null || note.isBlank() ? null : note.trim();
        if (!CONFLICT_OPEN.equals(conflict.getStatus())) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.CONFLICT, "This conflict was already decided. Reload its history.");
        if (trimmedNote != null && trimmedNote.length() > 700) throw new IllegalArgumentException("Keep the decision note within 700 characters.");
        WorkspaceStudentAssociation disconnected = null;
        Instant decidedAt = clock.instant();
        if (CONFLICT_RESOLVED.equals(normalized)) {
            if (!confirmedSubject.equals(conflict.getExistingSubject()) && !confirmedSubject.equals(conflict.getConflictingSubject()))
                throw new IllegalArgumentException("Choose one of the two conflicting accounts.");
            var winner = associationRepository.findByWorkspaceIdAndGoogleSubject(workspaceId, confirmedSubject)
                .filter(a -> a.isActive() && a.getStudentRecordId().equals(conflict.getStudentRecordId()))
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                    "That account no longer holds this student record. Reload before deciding."));
            String other = confirmedSubject.equals(conflict.getExistingSubject()) ? conflict.getConflictingSubject() : conflict.getExistingSubject();
            disconnected = associationRepository.findByWorkspaceIdAndGoogleSubject(workspaceId, other)
                .filter(a -> a.getStudentRecordId().equals(conflict.getStudentRecordId()))
                .orElse(null);
            if (disconnected != null) {
                disconnected.setActive(false);
                disconnected.setUpdatedAt(decidedAt);
                associationRepository.save(disconnected);
            }
            trimmedNote = "Confirmed account: " + winner.getGoogleEmail() + "." + (trimmedNote == null ? "" : " " + trimmedNote);
        }
        conflict.decide(normalized, decidedBySubject, decidedByEmail, trimmedNote, decidedAt);
        events.record(workspaceId, conflictId, decidedBySubject, "IDENTITY_CONFLICT_DECIDED", java.util.Map.of("decision", normalized));
        StudentIdentityConflict saved = conflictRepository.save(conflict);
        if (disconnected != null) {
            closeConflictsForDisconnectedIdentity(workspaceId, conflict.getStudentRecordId(), disconnected.getGoogleSubject(),
                disconnected.getGoogleEmail(), decidedBySubject, decidedByEmail, decidedAt, "ADMIN_RESOLUTION");
        }
        return toDetail(saved);
    }

    private ConflictDetail toDetail(StudentIdentityConflict conflict) {
        StudentRecord record = studentRecordRepository.findById(conflict.getStudentRecordId()).orElse(null);
        return new ConflictDetail(
            conflict.getId(),
            conflict.getStudentRecordId(),
            record == null ? null : record.getStudentNumber(),
            record == null ? null : record.getStudentName(),
            record == null ? null : record.getTeamCode(),
            conflict.getStatus(),
            conflict.getCreatedAt(),
            identityOf(conflict.getWorkspaceId(), conflict.getStudentRecordId(), conflict.getExistingSubject()),
            identityOf(conflict.getWorkspaceId(), conflict.getStudentRecordId(), conflict.getConflictingSubject()),
            conflict.getDecidedAt(),
            conflict.getDecidedBySubject(),
            conflict.getDecidedByEmail(),
            conflict.getDecisionNote()
        );
    }

    private ConflictIdentity identityOf(UUID workspaceId, UUID studentRecordId, String googleSubject) {
        return associationRepository.findByWorkspaceIdAndGoogleSubject(workspaceId, googleSubject)
            .map(association -> new ConflictIdentity(
                googleSubject,
                association.getGoogleEmail(),
                association.isActive() && association.getStudentRecordId().equals(studentRecordId),
                association.getUpdatedAt()
            ))
            .orElseGet(() -> new ConflictIdentity(googleSubject, null, false, null));
    }

    /** Disconnect keeps submissions/history/audit intact — only the link deactivates. */
    @Transactional
    public void disconnect(UUID workspaceId, String googleSubject) {
        associationRepository.findByWorkspaceIdAndGoogleSubjectAndActiveTrue(workspaceId, googleSubject)
            .ifPresent(association -> {
                Instant disconnectedAt = clock.instant();
                association.setActive(false);
                association.setUpdatedAt(disconnectedAt);
                associationRepository.save(association);
                events.record(workspaceId, association.getId(), googleSubject, "ASSOCIATION_DISCONNECTED", java.util.Map.of());
                closeConflictsForDisconnectedIdentity(workspaceId, association.getStudentRecordId(), googleSubject,
                    association.getGoogleEmail(), googleSubject, association.getGoogleEmail(), disconnectedAt, "SELF_DISCONNECT");
            });
    }

    private void ensureOpenConflicts(UUID workspaceId, UUID studentRecordId, String newSubject,
            List<WorkspaceStudentAssociation> existingHolders, Instant createdAt) {
        if (existingHolders.isEmpty()) return;
        var open = conflictRepository.findAllByWorkspaceIdAndStudentRecordIdAndStatusOrderByCreatedAtDesc(
            workspaceId, studentRecordId, CONFLICT_OPEN);
        for (var holder : existingHolders) {
            boolean pairAlreadyOpen = open.stream().anyMatch(conflict -> samePair(
                conflict, holder.getGoogleSubject(), newSubject));
            if (!pairAlreadyOpen) {
                conflictRepository.save(new StudentIdentityConflict(
                    UUID.randomUUID(), workspaceId, studentRecordId, holder.getGoogleSubject(), newSubject, CONFLICT_OPEN, createdAt));
            }
        }
    }

    /**
     * A self-disconnect or reassociation is itself enough evidence that this Google identity no
     * longer claims the record. Close only conflicts involving that identity; collisions among
     * any other still-connected claimants remain OPEN for Admin review.
     */
    private void closeConflictsForDisconnectedIdentity(UUID workspaceId, UUID studentRecordId,
            String disconnectedSubject, String disconnectedEmail, String decidedBySubject, String decidedByEmail,
            Instant decidedAt, String reason) {
        var open = conflictRepository.findAllByWorkspaceIdAndStudentRecordIdAndStatusOrderByCreatedAtDesc(
            workspaceId, studentRecordId, CONFLICT_OPEN);
        for (var conflict : open) {
            if (!conflict.getExistingSubject().equals(disconnectedSubject)
                    && !conflict.getConflictingSubject().equals(disconnectedSubject)) continue;
            String otherSubject = conflict.getExistingSubject().equals(disconnectedSubject)
                ? conflict.getConflictingSubject() : conflict.getExistingSubject();
            var remaining = associationRepository.findByWorkspaceIdAndGoogleSubject(workspaceId, otherSubject)
                .filter(association -> association.isActive() && association.getStudentRecordId().equals(studentRecordId));
            String status;
            String note;
            if (remaining.isPresent()) {
                status = CONFLICT_RESOLVED;
                note = autoDecisionPrefix(reason, disconnectedEmail, true)
                    + " Confirmed account: " + remaining.get().getGoogleEmail() + ".";
            } else {
                status = CONFLICT_DISMISSED;
                note = autoDecisionPrefix(reason, disconnectedEmail, false)
                    + " Neither conflicting account remains connected to this student record.";
            }
            conflict.decide(status, decidedBySubject, decidedByEmail, note, decidedAt);
            conflictRepository.save(conflict);
            events.record(workspaceId, conflict.getId(), decidedBySubject, "IDENTITY_CONFLICT_AUTO_DECIDED",
                java.util.Map.of("decision", status, "reason", reason));
        }
    }

    private static String autoDecisionPrefix(String reason, String disconnectedEmail, boolean resolved) {
        String action = resolved ? "Automatically resolved" : "Automatically closed";
        return switch (reason) {
            case "REASSOCIATED" -> action + " after " + disconnectedEmail + " connected to a different student record.";
            case "ADMIN_RESOLUTION" -> action + " because " + disconnectedEmail
                + " was disconnected by another identity-conflict decision.";
            default -> action + " after " + disconnectedEmail + " disconnected this student record.";
        };
    }

    private static boolean samePair(StudentIdentityConflict conflict, String firstSubject, String secondSubject) {
        return (conflict.getExistingSubject().equals(firstSubject) && conflict.getConflictingSubject().equals(secondSubject))
            || (conflict.getExistingSubject().equals(secondSubject) && conflict.getConflictingSubject().equals(firstSubject));
    }

    private Optional<AssociationView> toView(WorkspaceStudentAssociation association) {
        return studentRecordRepository.findById(association.getStudentRecordId())
            .filter(StudentRecord::isCurrentActive)
            .map(record -> new AssociationView(
                association.getId(),
                association.getWorkspaceId(),
                association.getGoogleEmail(),
                record.getId(),
                record.getStudentNumber(),
                record.getStudentName(),
                record.getTeamCode(),
                association.getAssuranceLevel()
            ));
    }
}



