package com.capvault.backend.drivehistory.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Anonymous LOGIN state is deliberately separate from session-bound CONNECT state. */
@Entity
@Table(name = "drive_history_login_states")
public class DriveOAuthLoginState {
    @Id
    @Column(name = "state_hash", length = 64)
    private String stateHash;
    @Column(name = "nonce_hash", nullable = false, length = 64)
    private String nonceHash;
    @Column(name = "return_path", nullable = false, length = 500)
    private String returnPath;
    @Column(name = "code_verifier", nullable = false, length = 128)
    private String codeVerifier;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected DriveOAuthLoginState() { }

    public DriveOAuthLoginState(String stateHash, String nonceHash, String returnPath,
                               String codeVerifier, Instant expiresAt) {
        this.stateHash = stateHash;
        this.nonceHash = nonceHash;
        this.returnPath = returnPath;
        this.codeVerifier = codeVerifier;
        this.expiresAt = expiresAt;
    }

    public String getNonceHash() { return nonceHash; }
    public String getReturnPath() { return returnPath; }
    public String getCodeVerifier() { return codeVerifier; }
    public Instant getExpiresAt() { return expiresAt; }
}
