package com.capvault.backend.student;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "student_identity_conflicts")
public class StudentIdentityConflict {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "student_record_id", nullable = false)
    private UUID studentRecordId;

    @Column(name = "existing_subject", nullable = false)
    private String existingSubject;

    @Column(name = "conflicting_subject", nullable = false)
    private String conflictingSubject;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected StudentIdentityConflict() {
    }

    public StudentIdentityConflict(UUID id, UUID workspaceId, UUID studentRecordId,
                                   String existingSubject, String conflictingSubject,
                                   String status, Instant createdAt) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.studentRecordId = studentRecordId;
        this.existingSubject = existingSubject;
        this.conflictingSubject = conflictingSubject;
        this.status = status;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; }
    public UUID getStudentRecordId() { return studentRecordId; }
    public String getExistingSubject() { return existingSubject; }
    public String getConflictingSubject() { return conflictingSubject; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
