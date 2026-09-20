package com.capvault.backend.drivehistory.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "drive_history_oauth_grants")
public class DriveOAuthGrant {
    @Id
    @Column(name = "google_subject", length = 255)
    private String googleSubject;

    @Column(name = "encrypted_refresh_token", length = 2048)
    private String encryptedRefreshToken;

    @Column(name = "granted_scopes", nullable = false, length = 2048)
    private String grantedScopes;

    @Column(name = "connected_at", nullable = false)
    private Instant connectedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    protected DriveOAuthGrant() { }

    public DriveOAuthGrant(String googleSubject, String encryptedRefreshToken, String grantedScopes, Instant connectedAt) {
        this.googleSubject = googleSubject;
        this.encryptedRefreshToken = encryptedRefreshToken;
        this.grantedScopes = grantedScopes;
        this.connectedAt = connectedAt;
    }

    public String getGoogleSubject() { return googleSubject; }
    public String getEncryptedRefreshToken() { return encryptedRefreshToken; }
    public String getGrantedScopes() { return grantedScopes; }
    public Instant getConnectedAt() { return connectedAt; }
    public Instant getRevokedAt() { return revokedAt; }

    public boolean connected() {
        return revokedAt == null && encryptedRefreshToken != null && !encryptedRefreshToken.isBlank()
            && java.util.Arrays.asList(grantedScopes.split("\\s+")).contains(DriveOAuthProperties.DRIVE_SCOPE);
    }

    public void revoke(Instant now) {
        encryptedRefreshToken = null;
        revokedAt = now;
    }

    public void updateRefreshToken(String encrypted) { encryptedRefreshToken = encrypted; }
}
