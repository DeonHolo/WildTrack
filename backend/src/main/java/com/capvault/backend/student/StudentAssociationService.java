package com.capvault.backend.student;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

@Service
public class StudentAssociationService {

    public static final String ASSURANCE_SELF_DECLARED = "SELF_DECLARED";
    public static final String CONFLICT_OPEN = "OPEN";
    public static final String CONFLICT_RESOLVED = "RESOLVED";
    public static final String CONFLICT_DISMISSED = "DISMISSED";

    private final WorkspaceStudentAssociationRepository associationRepository;
    private final CanonicalStudentAccountBindingRepository canonicalBindingRepository;
    private final StudentIdentityConflictRepository conflictRepository;
    private final StudentRecordRepository studentRecordRepository;
    private final Clock clock;
    private final com.capvault.backend.response.DomainEventRecorder events;

    public StudentAssociationService(
        WorkspaceStudentAssociationRepository associationRepository,
        CanonicalStudentAccountBindingRepository canonicalBindingRepository,
        StudentIdentityConflictRepository conflictRepository,
        StudentRecordRepository studentRecordRepository,
        Clock clock,
        com.capvault.backend.response.DomainEventRecorder events
    ) {
        this.associationRepository = associationRepository;
        this.canonicalBindingRepository = canonicalBindingRepository;
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

    public record AccountCandidate(
        String googleSubject,
        String googleEmail,
        boolean active,
        Instant lastSeenAt
    ) {
    }

    public record AccountBindingView(
        UUID studentRecordId,
        String studentNumber,
        String studentName,
        String teamCode,
        String status,
        String googleSubject,
        String googleEmail,
        List<AccountCandidate> candidates
    ) {
    }

    public record AccountManagementView(
        String firstClaimLimitation,
        List<AccountBindingView> accounts
    ) {
    }

    public static class AccountBindingConflictException extends RuntimeException {
        public AccountBindingConflictException(String message) {
            super(message);
        }
    }

    @Transactional(readOnly = true)
    public Optional<AssociationView> activeAssociation(UUID workspaceId, String googleSubject) {
        Optional<CanonicalStudentAccountBinding> canonical = canonicalBindingRepository.findByGoogleSubject(googleSubject)
            .filter(CanonicalStudentAccountBinding::isBound);
        if (canonical.isPresent()) {
            return studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(
                    workspaceId, canonical.get().getStudentNumberKey())
                .filter(StudentRecord::isCurrentActive)
                .map(record -> canonicalView(workspaceId, canonical.get(), record));
        }

        Optional<WorkspaceStudentAssociation> legacy = associationRepository
            .findByWorkspaceIdAndGoogleSubjectAndActiveTrue(workspaceId, googleSubject);
        if (legacy.isEmpty()) return Optional.empty();
        String key = normalizeStudentNumber(legacy.get().getStudentNumber());
        Optional<CanonicalStudentAccountBinding> binding = canonicalBindingRepository.findById(key);
        if (binding.filter(CanonicalStudentAccountBinding::isBound).isPresent()
                || binding.map(CanonicalStudentAccountBinding::getBlockedGoogleSubject)
                    .filter(googleSubject::equals).isPresent()) {
            return Optional.empty();
        }
        Set<String> activeSubjects = activeLegacyClaims(legacy.get().getStudentNumber()).stream()
            .map(WorkspaceStudentAssociation::getGoogleSubject)
            .collect(Collectors.toSet());
        if (activeSubjects.size() != 1 || !activeSubjects.contains(googleSubject)) return Optional.empty();
        return toView(legacy.get());
    }

    /** Validates a roster choice without reserving ownership. Binding happens only inside a successful response save. */
    @Transactional(readOnly = true)
    public AssociationView previewAssociation(UUID workspaceId, String googleSubject, String googleEmail, String studentNumber) {
        StudentRecord record = requireCurrentRecord(workspaceId, studentNumber);
        return new AssociationView(null, workspaceId, googleEmail, record.getId(), record.getStudentNumber(),
            record.getStudentName(), record.getTeamCode(), ASSURANCE_SELF_DECLARED);
    }

    /**
     * Joins the response transaction. Field validation must already have succeeded before this is called.
     * The canonical row is locked so two accounts cannot win the same first successful claim concurrently.
     */
    @Transactional
    public AssociationView associationForSuccessfulSave(UUID workspaceId, String googleSubject, String googleEmail,
            String studentNumber, boolean editingExistingResponse) {
        StudentRecord selected = requireCurrentRecord(workspaceId, studentNumber);
        StudentRecord record = studentRecordRepository.lockById(selected.getId())
            .filter(StudentRecord::isCurrentActive)
            .orElseThrow(() -> new IllegalArgumentException("That Student Record is no longer available in this workspace."));
        String key = normalizeStudentNumber(record.getStudentNumber());
        CanonicalStudentAccountBinding binding = lockCanonicalBinding(key);
        Instant now = clock.instant();

        canonicalBindingRepository.findByGoogleSubject(googleSubject)
            .filter(other -> !other.getStudentNumberKey().equals(key) && other.isBound())
            .ifPresent(other -> { throw new AccountBindingConflictException(
                "This Google account is already associated with a different Student Number. Ask an administrator to recover the account binding."); });

        if (binding.isBound()) {
            if (!googleSubject.equals(binding.getGoogleSubject())) {
                throw new AccountBindingConflictException(
                    "This Student Number is already associated with another Google account. Ask an administrator to review the account binding.");
            }
            WorkspaceStudentAssociation workspaceAssociation = upsertWorkspaceAssociation(record, googleSubject, googleEmail, now);
            return toView(workspaceAssociation).orElseThrow();
        }

        if (googleSubject.equals(binding.getBlockedGoogleSubject())) {
            throw new AccountBindingConflictException(
                "This Google account was disconnected from the Student Number by an administrator. Ask an administrator to recover the account binding.");
        }

        List<WorkspaceStudentAssociation> activeLegacy = activeLegacyClaims(record.getStudentNumber());
        Map<String, WorkspaceStudentAssociation> legacyBySubject = latestBySubject(activeLegacy);
        if (legacyBySubject.size() > 1 || hasOpenLegacyConflictForStudentNumber(record.getStudentNumber())) {
            throw new AccountBindingConflictException(
                "This Student Number has unresolved account claims. Ask an administrator to review account management before submitting.");
        }
        if (legacyBySubject.size() == 1) {
            WorkspaceStudentAssociation legacyHolder = legacyBySubject.values().iterator().next();
            if (!googleSubject.equals(legacyHolder.getGoogleSubject())) {
                throw new AccountBindingConflictException(
                    "This Student Number is already associated with another Google account. Ask an administrator to review the account binding.");
            }
            binding.bind(googleSubject, googleEmail, now);
            canonicalBindingRepository.save(binding);
            WorkspaceStudentAssociation workspaceAssociation = upsertWorkspaceAssociation(record, googleSubject, googleEmail, now);
            events.record(workspaceId, record.getId(), googleSubject, "ACCOUNT_BINDING_MIGRATED",
                Map.of("studentNumber", record.getStudentNumber(), "source", "LEGACY_WORKSPACE_ASSOCIATION"));
            return toView(workspaceAssociation).orElseThrow();
        }

        if (editingExistingResponse) {
            throw new AccountBindingConflictException(
                "This account is no longer associated with the Student Number for this saved response. Ask an administrator to recover the account binding before editing it.");
        }

        binding.bind(googleSubject, googleEmail, now);
        canonicalBindingRepository.save(binding);
        WorkspaceStudentAssociation workspaceAssociation = upsertWorkspaceAssociation(record, googleSubject, googleEmail, now);
        events.record(workspaceId, record.getId(), googleSubject, "ACCOUNT_BOUND_ON_FIRST_SUCCESSFUL_SUBMISSION",
            Map.of("studentNumber", record.getStudentNumber(), "assurance", ASSURANCE_SELF_DECLARED));
        return toView(workspaceAssociation).orElseThrow();
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

    @Transactional(readOnly = true)
    public AccountManagementView accountManagement(UUID workspaceId) {
        List<AccountBindingView> accounts = studentRecordRepository
            .findAllByWorkspaceIdOrderByTeamCodeAscMemberNumberAscStudentNameAsc(workspaceId).stream()
            .filter(StudentRecord::isCurrentActive)
            .map(this::accountBindingView)
            .toList();
        return new AccountManagementView(
            "Account ownership is self-declared by the first successful submission. This prevents later account overwrites, but it cannot prove the first claimant was the rightful student.",
            accounts);
    }

    @Transactional
    public AccountBindingView adminDisconnect(UUID workspaceId, UUID studentRecordId,
            String actorSubject, String actorEmail) {
        StudentRecord selected = requireWorkspaceRecord(workspaceId, studentRecordId);
        StudentRecord record = studentRecordRepository.lockById(selected.getId()).orElseThrow();
        String key = normalizeStudentNumber(record.getStudentNumber());
        CanonicalStudentAccountBinding binding = lockCanonicalBinding(key);
        EffectiveBinding effective = effectiveBinding(binding, record.getStudentNumber(), record.getId());
        if (effective.conflict()) {
            throw new AccountBindingConflictException(
                "This Student Number has unresolved account claims. Choose a recovery account instead of disconnecting an unknown winner.");
        }
        if (effective.googleSubject() == null) {
            throw new IllegalArgumentException("This Student Number has no active account binding to disconnect.");
        }
        Instant now = clock.instant();
        binding.disconnect(effective.googleSubject(), effective.googleEmail(), now);
        canonicalBindingRepository.save(binding);
        deactivateLegacyClaims(record.getStudentNumber(), now);
        events.record(workspaceId, record.getId(), actorSubject, "ACCOUNT_BINDING_ADMIN_DISCONNECTED", Map.of(
            "studentNumber", record.getStudentNumber(),
            "disconnectedSubject", effective.googleSubject(),
            "disconnectedEmail", String.valueOf(effective.googleEmail()),
            "actorEmail", String.valueOf(actorEmail)));
        return accountBindingView(record);
    }

    @Transactional
    public AccountBindingView adminRecover(UUID workspaceId, UUID studentRecordId, String confirmedSubject,
            String actorSubject, String actorEmail) {
        if (confirmedSubject == null || confirmedSubject.isBlank()) {
            throw new IllegalArgumentException("Choose an account to recover.");
        }
        StudentRecord selected = requireWorkspaceRecord(workspaceId, studentRecordId);
        StudentRecord record = studentRecordRepository.lockById(selected.getId()).orElseThrow();
        String key = normalizeStudentNumber(record.getStudentNumber());
        CanonicalStudentAccountBinding binding = lockCanonicalBinding(key);
        Map<String, WorkspaceStudentAssociation> known = latestBySubject(
            associationRepository.findAllByStudentNumberIgnoreCaseOrderByUpdatedAtDesc(record.getStudentNumber()));
        String recoveredEmail = Optional.ofNullable(known.get(confirmedSubject))
            .map(WorkspaceStudentAssociation::getGoogleEmail)
            .orElseGet(() -> confirmedSubject.equals(binding.getBlockedGoogleSubject()) ? binding.getBlockedGoogleEmail() : null);
        if (recoveredEmail == null || recoveredEmail.isBlank()) {
            throw new IllegalArgumentException("Choose an account previously recorded for this Student Number.");
        }
        canonicalBindingRepository.findByGoogleSubject(confirmedSubject)
            .filter(other -> !other.getStudentNumberKey().equals(key) && other.isBound())
            .ifPresent(other -> { throw new AccountBindingConflictException(
                "That Google account is already associated with a different Student Number."); });

        Instant now = clock.instant();
        deactivateLegacyClaims(record.getStudentNumber(), now);
        binding.bind(confirmedSubject, recoveredEmail, now);
        canonicalBindingRepository.save(binding);
        upsertWorkspaceAssociation(record, confirmedSubject, recoveredEmail, now);
        closeConflictsAfterExplicitRecovery(record.getStudentNumber(), confirmedSubject, recoveredEmail,
            actorSubject, actorEmail, now);
        events.record(workspaceId, record.getId(), actorSubject, "ACCOUNT_BINDING_ADMIN_RECOVERED", Map.of(
            "studentNumber", record.getStudentNumber(),
            "confirmedSubject", confirmedSubject,
            "confirmedEmail", recoveredEmail,
            "actorEmail", String.valueOf(actorEmail)));
        return accountBindingView(record);
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

    private AccountBindingView accountBindingView(StudentRecord record) {
        String key = normalizeStudentNumber(record.getStudentNumber());
        CanonicalStudentAccountBinding binding = canonicalBindingRepository.findById(key).orElse(null);
        EffectiveBinding effective = effectiveBinding(binding, record.getStudentNumber(), record.getId());
        Map<String, WorkspaceStudentAssociation> candidatesBySubject = latestBySubject(
            associationRepository.findAllByStudentNumberIgnoreCaseOrderByUpdatedAtDesc(record.getStudentNumber()));
        if (binding != null && binding.getBlockedGoogleSubject() != null
                && !candidatesBySubject.containsKey(binding.getBlockedGoogleSubject())) {
            candidatesBySubject.put(binding.getBlockedGoogleSubject(), null);
        }
        List<AccountCandidate> candidates = candidatesBySubject.entrySet().stream()
            .map(entry -> {
                WorkspaceStudentAssociation association = entry.getValue();
                String email = association == null ? binding.getBlockedGoogleEmail() : association.getGoogleEmail();
                boolean active = association != null && association.isActive();
                Instant lastSeen = association == null ? binding.getUpdatedAt() : association.getUpdatedAt();
                return new AccountCandidate(entry.getKey(), email, active, lastSeen);
            })
            .sorted((first, second) -> {
                Instant a = first.lastSeenAt() == null ? Instant.EPOCH : first.lastSeenAt();
                Instant b = second.lastSeenAt() == null ? Instant.EPOCH : second.lastSeenAt();
                return b.compareTo(a);
            })
            .toList();
        return new AccountBindingView(record.getId(), record.getStudentNumber(), record.getStudentName(),
            record.getTeamCode(), effective.conflict() ? "CONFLICT" : effective.googleSubject() == null ? "UNBOUND" : "BOUND",
            effective.googleSubject(), effective.googleEmail(), candidates);
    }

    private EffectiveBinding effectiveBinding(CanonicalStudentAccountBinding binding, String studentNumber, UUID studentRecordId) {
        if (binding != null && binding.isBound()) {
            return new EffectiveBinding(binding.getGoogleSubject(), binding.getGoogleEmail(), false);
        }
        Map<String, WorkspaceStudentAssociation> active = latestBySubject(activeLegacyClaims(studentNumber));
        boolean openConflict = hasOpenLegacyConflictForStudentNumber(studentNumber);
        if (active.size() > 1 || openConflict) return new EffectiveBinding(null, null, true);
        if (active.size() == 1) {
            WorkspaceStudentAssociation only = active.values().iterator().next();
            return new EffectiveBinding(only.getGoogleSubject(), only.getGoogleEmail(), false);
        }
        return new EffectiveBinding(null, null, false);
    }

    private record EffectiveBinding(String googleSubject, String googleEmail, boolean conflict) { }

    private StudentRecord requireCurrentRecord(UUID workspaceId, String studentNumber) {
        if (studentNumber == null || studentNumber.isBlank()) {
            throw new IllegalArgumentException("Choose a Student Number from this workspace.");
        }
        StudentRecord record = studentRecordRepository.findByWorkspaceIdAndStudentNumberIgnoreCase(workspaceId, studentNumber)
            .orElseThrow(() -> new IllegalArgumentException("No Student Record with that number exists in this workspace."));
        if (!record.isCurrentActive()) {
            throw new IllegalArgumentException("That Student Record is not part of the current Tracker roster.");
        }
        return record;
    }

    private StudentRecord requireWorkspaceRecord(UUID workspaceId, UUID studentRecordId) {
        return studentRecordRepository.findById(studentRecordId)
            .filter(record -> workspaceId.equals(record.getWorkspaceId()))
            .orElseThrow(() -> new IllegalArgumentException("Student Record was not found in this workspace."));
    }

    private CanonicalStudentAccountBinding lockCanonicalBinding(String key) {
        Optional<CanonicalStudentAccountBinding> existing = canonicalBindingRepository.lockByStudentNumberKey(key);
        if (existing.isPresent()) return existing.get();
        try {
            CanonicalStudentAccountBinding created = canonicalBindingRepository.saveAndFlush(
                new CanonicalStudentAccountBinding(key, clock.instant()));
            return canonicalBindingRepository.lockByStudentNumberKey(created.getStudentNumberKey()).orElseThrow();
        } catch (DataIntegrityViolationException concurrentInsert) {
            throw new AccountBindingConflictException(
                "This Student Number was claimed by another submission at the same time. Reload and try again.");
        }
    }

    private WorkspaceStudentAssociation upsertWorkspaceAssociation(StudentRecord record, String googleSubject,
            String googleEmail, Instant now) {
        WorkspaceStudentAssociation association = associationRepository
            .findByWorkspaceIdAndGoogleSubject(record.getWorkspaceId(), googleSubject)
            .orElseGet(() -> new WorkspaceStudentAssociation(UUID.randomUUID(), record.getWorkspaceId(), googleSubject,
                googleEmail, record.getId(), record.getStudentNumber(), ASSURANCE_SELF_DECLARED, true, now, now));
        association.setGoogleEmail(googleEmail);
        association.setStudentRecordId(record.getId());
        association.setStudentNumber(record.getStudentNumber());
        association.setActive(true);
        association.setUpdatedAt(now);
        return associationRepository.save(association);
    }

    private List<WorkspaceStudentAssociation> activeLegacyClaims(String studentNumber) {
        return associationRepository.findAllByStudentNumberIgnoreCaseAndActiveTrueOrderByUpdatedAtDesc(studentNumber);
    }

    private Map<String, WorkspaceStudentAssociation> latestBySubject(List<WorkspaceStudentAssociation> claims) {
        Map<String, WorkspaceStudentAssociation> latest = new LinkedHashMap<>();
        for (WorkspaceStudentAssociation claim : claims) latest.putIfAbsent(claim.getGoogleSubject(), claim);
        return latest;
    }

    private void deactivateLegacyClaims(String studentNumber, Instant now) {
        List<WorkspaceStudentAssociation> active = activeLegacyClaims(studentNumber);
        active.forEach(association -> {
            association.setActive(false);
            association.setUpdatedAt(now);
        });
        associationRepository.saveAll(active);
    }

    private boolean hasOpenLegacyConflictForStudentNumber(String studentNumber) {
        String key = normalizeStudentNumber(studentNumber);
        for (StudentIdentityConflict conflict : conflictRepository.findAllByStatusOrderByCreatedAtDesc(CONFLICT_OPEN)) {
            StudentRecord record = studentRecordRepository.findById(conflict.getStudentRecordId()).orElse(null);
            if (record != null && normalizeStudentNumber(record.getStudentNumber()).equals(key)) return true;
        }
        return false;
    }

    private void closeConflictsAfterExplicitRecovery(String studentNumber, String confirmedSubject, String confirmedEmail,
            String actorSubject, String actorEmail, Instant decidedAt) {
        String key = normalizeStudentNumber(studentNumber);
        for (StudentIdentityConflict conflict : new ArrayList<>(conflictRepository.findAllByStatusOrderByCreatedAtDesc(CONFLICT_OPEN))) {
            StudentRecord record = studentRecordRepository.findById(conflict.getStudentRecordId()).orElse(null);
            if (record == null || !normalizeStudentNumber(record.getStudentNumber()).equals(key)) continue;
            String note = conflict.getExistingSubject().equals(confirmedSubject) || conflict.getConflictingSubject().equals(confirmedSubject)
                ? "Admin account recovery confirmed account: " + confirmedEmail + "."
                : "Admin account recovery selected a different previously recorded account: " + confirmedEmail + ".";
            conflict.decide(CONFLICT_RESOLVED, actorSubject, actorEmail, note, decidedAt);
            conflictRepository.save(conflict);
            events.record(conflict.getWorkspaceId(), conflict.getId(), actorSubject, "IDENTITY_CONFLICT_DECIDED",
                Map.of("decision", CONFLICT_RESOLVED, "reason", "ADMIN_ACCOUNT_RECOVERY"));
        }
    }

    private AssociationView canonicalView(UUID workspaceId, CanonicalStudentAccountBinding binding, StudentRecord record) {
        return new AssociationView(null, workspaceId, binding.getGoogleEmail(), record.getId(), record.getStudentNumber(),
            record.getStudentName(), record.getTeamCode(), ASSURANCE_SELF_DECLARED);
    }

    private static String normalizeStudentNumber(String studentNumber) {
        return String.valueOf(studentNumber == null ? "" : studentNumber).trim().toLowerCase(Locale.ROOT);
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



