package com.capvault.backend.staff;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "staff_role_assignments",
    uniqueConstraints = @UniqueConstraint(name = "uq_staff_subject_role", columnNames = {"google_subject", "role"}))
public class StaffRoleAssignment {

    @Id
    private UUID id;

    @Column(name = "google_subject", nullable = false)
    private String googleSubject;

    @Column(name = "google_email", nullable = false)
    private String googleEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private StaffRole role;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected StaffRoleAssignment() {
    }

    public StaffRoleAssignment(UUID id, String googleSubject, String googleEmail, StaffRole role,
                               boolean enabled, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.googleSubject = googleSubject;
        this.googleEmail = googleEmail;
        this.role = role;
        this.enabled = enabled;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() { return id; }
    public String getGoogleSubject() { return googleSubject; }
    public String getGoogleEmail() { return googleEmail; }
    public StaffRole getRole() { return role; }
    public boolean isEnabled() { return enabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
