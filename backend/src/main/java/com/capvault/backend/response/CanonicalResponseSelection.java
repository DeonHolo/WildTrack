package com.capvault.backend.response;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "canonical_response_selections")
public class CanonicalResponseSelection {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "student_record_id", nullable = false)
    private UUID studentRecordId;

    @Column(name = "deliverable_id", nullable = false)
    private UUID deliverableId;

    @Column(name = "canonical_response_id", nullable = false)
    private UUID canonicalResponseId;

    @Column(name = "selected_by_subject", nullable = false)
    private String selectedBySubject;

    @Column(length = 500)
    private String reason;

    @Column(name = "previous_response_id")
    private UUID previousResponseId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CanonicalResponseSelection() {
    }

    public CanonicalResponseSelection(UUID id, UUID workspaceId, UUID studentRecordId, UUID deliverableId,
                                      UUID canonicalResponseId, String selectedBySubject, String reason,
                                      UUID previousResponseId, Instant createdAt) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.studentRecordId = studentRecordId;
        this.deliverableId = deliverableId;
        this.canonicalResponseId = canonicalResponseId;
        this.selectedBySubject = selectedBySubject;
        this.reason = reason;
        this.previousResponseId = previousResponseId;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; }
    public UUID getStudentRecordId() { return studentRecordId; }
    public UUID getDeliverableId() { return deliverableId; }
    public UUID getCanonicalResponseId() { return canonicalResponseId; }
    public String getSelectedBySubject() { return selectedBySubject; }
    public String getReason() { return reason; }
    public UUID getPreviousResponseId() { return previousResponseId; }
    public Instant getCreatedAt() { return createdAt; }
}
