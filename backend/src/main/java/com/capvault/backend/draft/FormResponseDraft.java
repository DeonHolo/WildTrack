package com.capvault.backend.draft;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

@Entity
@Table(name = "form_response_drafts",
    uniqueConstraints = @UniqueConstraint(name = "uq_draft_workspace_deliverable_subject",
        columnNames = {"workspace_id", "deliverable_id", "google_subject"}))
public class FormResponseDraft {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "deliverable_id", nullable = false)
    private UUID deliverableId;

    @Column(name = "google_subject", nullable = false)
    private String googleSubject;

    @Column(name = "values_json", nullable = false, columnDefinition = "TEXT")
    private String valuesJson;

    @Version
    @Column(nullable = false)
    private long revision;

    @Column(nullable = false)
    private boolean completed;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected FormResponseDraft() {
    }

    public FormResponseDraft(UUID id, UUID workspaceId, UUID deliverableId, String googleSubject,
                             String valuesJson, boolean completed, Instant expiresAt, Instant updatedAt) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.deliverableId = deliverableId;
        this.googleSubject = googleSubject;
        this.valuesJson = valuesJson;
        this.completed = completed;
        this.expiresAt = expiresAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; }
    public UUID getDeliverableId() { return deliverableId; }
    public String getGoogleSubject() { return googleSubject; }
    public String getValuesJson() { return valuesJson; }
    public void setValuesJson(String valuesJson) { this.valuesJson = valuesJson; }
    public long getRevision() { return revision; }
    public boolean isCompleted() { return completed; }
    public void setCompleted(boolean completed) { this.completed = completed; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
