package com.capvault.backend.staff;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "adviser_team_assignments",
    uniqueConstraints = @UniqueConstraint(name = "uq_adviser_team", columnNames = {"workspace_id", "google_subject", "team_code"}))
public class AdviserTeamAssignment {

    @Id
    private UUID id;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "google_subject", nullable = false)
    private String googleSubject;

    @Column(name = "team_code", nullable = false, length = 160)
    private String teamCode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AdviserTeamAssignment() {
    }

    public AdviserTeamAssignment(UUID id, UUID workspaceId, String googleSubject, String teamCode, Instant createdAt) {
        this.id = id;
        this.workspaceId = workspaceId;
        this.googleSubject = googleSubject;
        this.teamCode = teamCode;
        this.createdAt = createdAt;
    }

    public UUID getId() { return id; }
    public UUID getWorkspaceId() { return workspaceId; }
    public String getGoogleSubject() { return googleSubject; }
    public String getTeamCode() { return teamCode; }
    public Instant getCreatedAt() { return createdAt; }
}
