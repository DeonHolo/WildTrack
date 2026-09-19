package com.capvault.backend.student;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "canonical_student_account_bindings")
public class CanonicalStudentAccountBinding {

    public static final String STATUS_UNBOUND = "UNBOUND";
    public static final String STATUS_BOUND = "BOUND";

    @Id
    @Column(name = "student_number_key", nullable = false, length = 80)
    private String studentNumberKey;

    @Column(name = "google_subject")
    private String googleSubject;

    @Column(name = "google_email")
    private String googleEmail;

    @Column(name = "blocked_google_subject")
    private String blockedGoogleSubject;

    @Column(name = "blocked_google_email")
    private String blockedGoogleEmail;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CanonicalStudentAccountBinding() {
    }

    public CanonicalStudentAccountBinding(String studentNumberKey, Instant now) {
        this.studentNumberKey = studentNumberKey;
        this.status = STATUS_UNBOUND;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public String getStudentNumberKey() { return studentNumberKey; }
    public String getGoogleSubject() { return googleSubject; }
    public String getGoogleEmail() { return googleEmail; }
    public String getBlockedGoogleSubject() { return blockedGoogleSubject; }
    public String getBlockedGoogleEmail() { return blockedGoogleEmail; }
    public String getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public boolean isBound() {
        return STATUS_BOUND.equals(status) && googleSubject != null && !googleSubject.isBlank();
    }

    public void bind(String googleSubject, String googleEmail, Instant now) {
        this.googleSubject = googleSubject;
        this.googleEmail = googleEmail;
        this.blockedGoogleSubject = null;
        this.blockedGoogleEmail = null;
        this.status = STATUS_BOUND;
        this.updatedAt = now;
    }

    public void disconnect(String blockedSubject, String blockedEmail, Instant now) {
        this.googleSubject = null;
        this.googleEmail = null;
        this.blockedGoogleSubject = blockedSubject;
        this.blockedGoogleEmail = blockedEmail;
        this.status = STATUS_UNBOUND;
        this.updatedAt = now;
    }
}
