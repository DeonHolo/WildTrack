package com.capvault.backend.response;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "response_feedback",
    uniqueConstraints = @UniqueConstraint(name = "uq_feedback_one_current", columnNames = {"response_id", "author_subject"}))
public class ResponseFeedback {

    @Id
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "response_id", nullable = false)
    private FormResponse response;

    @Column(name = "author_subject", nullable = false)
    private String authorSubject;

    @Column(name = "author_email", nullable = false)
    private String authorEmail;

    @Column(name = "author_role", nullable = false, length = 32)
    private String authorRole;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String note;

    @Column(nullable = false, length = 32)
    private String visibility;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ResponseFeedback() {
    }

    public ResponseFeedback(UUID id, FormResponse response, String authorSubject, String authorEmail,
                            String authorRole, String note, String visibility, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.response = response;
        this.authorSubject = authorSubject;
        this.authorEmail = authorEmail;
        this.authorRole = authorRole;
        this.note = note;
        this.visibility = visibility;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() { return id; }
    public FormResponse getResponse() { return response; }
    public String getAuthorSubject() { return authorSubject; }
    public String getAuthorEmail() { return authorEmail; }
    public String getAuthorRole() { return authorRole; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public String getVisibility() { return visibility; }
    public void setVisibility(String visibility) { this.visibility = visibility; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
