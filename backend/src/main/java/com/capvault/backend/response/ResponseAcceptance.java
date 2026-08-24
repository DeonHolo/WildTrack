package com.capvault.backend.response;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "response_acceptances",
    uniqueConstraints = @UniqueConstraint(name = "uq_acceptance_active", columnNames = {"response_id"}))
public class ResponseAcceptance {

    @Id
    private UUID id;

    @OneToOne(optional = false)
    @JoinColumn(name = "response_id", nullable = false)
    private FormResponse response;

    @Column(name = "accepted_by_subject", nullable = false)
    private String acceptedBySubject;

    @Column(name = "accepted_by_email", nullable = false)
    private String acceptedByEmail;

    @Column(name = "accepted_by_role", nullable = false, length = 32)
    private String acceptedByRole;

    @Column(name = "source_response_updated_at", nullable = false)
    private Instant sourceResponseUpdatedAt;

    @Column(name = "accepted_at", nullable = false)
    private Instant acceptedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected ResponseAcceptance() {
    }

    public ResponseAcceptance(UUID id, FormResponse response, String acceptedBySubject, String acceptedByEmail,
                              String acceptedByRole, Instant sourceResponseUpdatedAt, Instant acceptedAt) {
        this.id = id;
        this.response = response;
        this.acceptedBySubject = acceptedBySubject;
        this.acceptedByEmail = acceptedByEmail;
        this.acceptedByRole = acceptedByRole;
        this.sourceResponseUpdatedAt = sourceResponseUpdatedAt;
        this.acceptedAt = acceptedAt;
    }

    public UUID getId() { return id; }
    public FormResponse getResponse() { return response; }
    public String getAcceptedBySubject() { return acceptedBySubject; }
    public String getAcceptedByRole() { return acceptedByRole; }
    public Instant getSourceResponseUpdatedAt() { return sourceResponseUpdatedAt; }
    public Instant getAcceptedAt() { return acceptedAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
}
