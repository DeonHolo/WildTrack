package com.capvault.backend.student;

import java.util.Optional;
import java.util.UUID;

import com.capvault.backend.workspace.AcademicWorkspace;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Optional self-enrolment into one dedicated validation workspace. */
@Service
public class ValidationParticipantEntry {
    private final boolean enabled;
    private final UUID workspaceId;
    private final EntityManager entities;
    private final StudentRecordRepository records;
    private final CanonicalStudentAccountBindingRepository bindings;
    private final WorkspaceStudentAssociationRepository legacyAssociations;
    private final StudentAssociationService associations;

    public ValidationParticipantEntry(
            @Value("${wildtrack.validation-entry.enabled:false}") boolean enabled,
            @Value("${wildtrack.validation-entry.workspace-id:}") String workspaceId,
            EntityManager entities, StudentRecordRepository records,
            CanonicalStudentAccountBindingRepository bindings,
            WorkspaceStudentAssociationRepository legacyAssociations, StudentAssociationService associations) {
        this.enabled = enabled;
        this.workspaceId = workspaceId == null || workspaceId.isBlank() ? null : UUID.fromString(workspaceId.trim());
        this.entities = entities;
        this.records = records;
        this.bindings = bindings;
        this.legacyAssociations = legacyAssociations;
        this.associations = associations;
    }

    @Transactional(readOnly = true)
    public boolean availableFor(String subject) {
        if (!enabled || workspaceId == null || subject == null || subject.isBlank()) return false;
        AcademicWorkspace workspace = entities.find(AcademicWorkspace.class, workspaceId);
        return workspace != null && workspace.isActive() && !hasConnection(subject);
    }

    @Transactional
    public Optional<StudentAssociationService.AssociationView> join(String subject, String email, String name) {
        if (!enabled || workspaceId == null || subject == null || subject.isBlank() || email == null || email.isBlank()) {
            return Optional.empty();
        }
        AcademicWorkspace workspace = entities.find(AcademicWorkspace.class, workspaceId, LockModeType.PESSIMISTIC_WRITE);
        if (workspace == null) return Optional.empty();
        entities.refresh(workspace, LockModeType.PESSIMISTIC_WRITE);
        if (!workspace.isActive()) return Optional.empty();
        var existing = associations.activeAssociation(workspaceId, subject);
        if (existing.isPresent()) return existing;
        // An existing class connection always wins over automatic entry.
        if (hasConnection(subject)) return Optional.empty();

        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase(java.util.Locale.ROOT);
        String assignedId = "ID-" + suffix;
        String displayName = name == null || name.isBlank() ? email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : email.length()) : name.trim();
        if (displayName.length() > 240) displayName = displayName.substring(0, 240);
        records.saveAndFlush(new StudentRecord(workspaceId, assignedId, displayName, "participant-" + suffix,
            "1", "Validation", null, email, null));
        return Optional.of(associations.connectDirectly(workspaceId, subject, email, assignedId));
    }

    private boolean hasConnection(String subject) {
        return bindings.findByGoogleSubject(subject).filter(CanonicalStudentAccountBinding::isBound).isPresent()
            || legacyAssociations.existsByGoogleSubjectAndActiveTrue(subject);
    }
}
