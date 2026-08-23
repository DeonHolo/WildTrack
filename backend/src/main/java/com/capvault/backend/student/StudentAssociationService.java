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

    private final WorkspaceStudentAssociationRepository associationRepository;
    private final StudentIdentityConflictRepository conflictRepository;
    private final StudentRecordRepository studentRecordRepository;
    private final Clock clock;

    public StudentAssociationService(
        WorkspaceStudentAssociationRepository associationRepository,
        StudentIdentityConflictRepository conflictRepository,
        StudentRecordRepository studentRecordRepository,
        Clock clock
    ) {
        this.associationRepository = associationRepository;
        this.conflictRepository = conflictRepository;
        this.studentRecordRepository = studentRecordRepository;
        this.clock = clock;
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

        Optional<WorkspaceStudentAssociation> existingActive =
            associationRepository.findByWorkspaceIdAndGoogleSubjectAndActiveTrue(workspaceId, googleSubject);

        if (existingActive.isPresent() && existingActive.get().getStudentRecordId().equals(record.getId())) {
            // Idempotent re-confirm: no-op returning current view
            return toView(existingActive.get()).orElseThrow();
        }

        boolean otherIdentityHoldsRecord = associationRepository
            .existsByWorkspaceIdAndStudentRecordIdAndGoogleSubjectNotAndActiveTrue(workspaceId, record.getId(), googleSubject);
        if (otherIdentityHoldsRecord) {
            String holder = associationRepository
                .findFirstByStudentRecordIdAndActiveTrueOrderByUpdatedAtDesc(record.getId())
                .map(WorkspaceStudentAssociation::getGoogleSubject)
                .orElse("unknown");
            conflictRepository.save(new StudentIdentityConflict(
                UUID.randomUUID(),
                workspaceId,
                record.getId(),
                holder,
                googleSubject,
                "OPEN",
                clock.instant()
            ));
        }

        Instant now = clock.instant();
        // One row per (workspace, subject): update or reactivate instead of inserting duplicates.
        WorkspaceStudentAssociation saved = associationRepository
            .findByWorkspaceIdAndGoogleSubject(workspaceId, googleSubject)
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
        return toView(saved).orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<StudentIdentityConflict> conflictsForWorkspace(UUID workspaceId) {
        return conflictRepository.findAllByWorkspaceIdOrderByCreatedAtDesc(workspaceId);
    }

    /** Disconnect keeps submissions/history/audit intact — only the link deactivates. */
    @Transactional
    public void disconnect(UUID workspaceId, String googleSubject) {
        associationRepository.findByWorkspaceIdAndGoogleSubjectAndActiveTrue(workspaceId, googleSubject)
            .ifPresent(association -> {
                association.setActive(false);
                association.setUpdatedAt(clock.instant());
                associationRepository.save(association);
            });
    }

    private Optional<AssociationView> toView(WorkspaceStudentAssociation association) {
        return studentRecordRepository.findById(association.getStudentRecordId())
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




