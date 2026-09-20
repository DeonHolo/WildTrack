package com.capvault.backend.drivehistory.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "drive_history_oauth_states")
public class DriveOAuthPendingState {
    @Id
    @Column(name = "state_hash", length = 64)
    private String stateHash;

    @Column(name = "nonce_hash", nullable = false, length = 64)
    private String nonceHash;

    @Column(name = "session_hash", nullable = false, length = 64)
    private String sessionHash;

    @Column(name = "google_subject", nullable = false, length = 255)
    private String googleSubject;

    @Column(name = "return_path", nullable = false, length = 500)
    private String returnPath;

    @Column(name = "code_verifier", nullable = false, length = 128)
    private String codeVerifier;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected DriveOAuthPendingState() { }

    public DriveOAuthPendingState(String stateHash, String nonceHash, String sessionHash, String googleSubject,
                                  String returnPath, String codeVerifier, Instant expiresAt) {
        this.stateHash = stateHash;
        this.nonceHash = nonceHash;
        this.sessionHash = sessionHash;
        this.googleSubject = googleSubject;
        this.returnPath = returnPath;
        this.codeVerifier = codeVerifier;
        this.expiresAt = expiresAt;
    }

    public String getNonceHash() { return nonceHash; }
    public String getSessionHash() { return sessionHash; }
    public String getGoogleSubject() { return googleSubject; }
    public String getReturnPath() { return returnPath; }
    public String getCodeVerifier() { return codeVerifier; }
    public Instant getExpiresAt() { return expiresAt; }
}
