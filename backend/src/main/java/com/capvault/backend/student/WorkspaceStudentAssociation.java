package com.capvault.backend.student;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "workspace_student_associations",
    uniqueConstraints = @UniqueConstraint(name = "uq_assoc_workspace_subject", columnNames = {"workspace_id", "google_subject"}))
public class WorkspaceStudentAssociation {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "google_subject", nullable = false)
    private String googleSubject;

    @Column(name = "google_email", nullable = false)
    private String googleEmail;

    @Column(name = "student_record_id", nullable = false)
    private UUID studentRecordId;

    @Column(name = "student_number", nullable = false, length = 80)
    private String studentNumber;

    @Column(name = "assurance_level", nullable = false, length = 32)
    private String assuranceLevel;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected WorkspaceStudentAssociation() {
    }

    public WorkspaceStudentAssociation(UUID id, UUID workspaceId, String googleSubject, String googleEmail,
                                       UUID studentRecordId, String studentNumber, String assuranceLevel,
                                       boolean active, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.googleSubject = googleSubject;
        this.googleEmail = googleEmail;
        this.studentRecordId = studentRecordId;
        this.studentNumber = studentNumber;
        this.assuranceLevel = assuranceLevel;
        this.active = active;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; }
    public String getGoogleSubject() { return googleSubject; }
    public String getGoogleEmail() { return googleEmail; }
    public UUID getStudentRecordId() { return studentRecordId; }
    public String getStudentNumber() { return studentNumber; }
    public String getAssuranceLevel() { return assuranceLevel; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public void setStudentRecordId(UUID studentRecordId) { this.studentRecordId = studentRecordId; }
    public void setStudentNumber(String studentNumber) { this.studentNumber = studentNumber; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}


