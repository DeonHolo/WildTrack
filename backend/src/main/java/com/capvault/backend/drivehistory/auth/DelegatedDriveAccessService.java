package com.capvault.backend.drivehistory.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Subject-scoped, optional delegated authorization. Access tokens live only in short-lived process memory. */
@Service
public class DelegatedDriveAccessService {
    private final DriveOAuthGrantRepository grants;
    private final DriveRefreshTokenCipher cipher;
    private final GoogleDriveOAuthTokenEndpoint tokens;
    private final DriveOAuthProperties properties;
    private final Clock clock;
    private final Map<String, CachedToken> shortLivedTokens = new ConcurrentHashMap<>();

    public DelegatedDriveAccessService(DriveOAuthGrantRepository grants, DriveRefreshTokenCipher cipher,
                                       GoogleDriveOAuthTokenEndpoint tokens, DriveOAuthProperties properties, Clock clock) {
        this.grants = grants;
        this.cipher = cipher;
        this.tokens = tokens;
        this.properties = properties;
        this.clock = clock;
    }

    public boolean isConfigured() { return properties.configured(); }

    @Transactional(readOnly = true)
    public boolean connected(String googleSubject) {
        return isConfigured() && googleSubject != null
            && grants.findById(googleSubject).map(DriveOAuthGrant::connected).orElse(false);
    }

    @Transactional
    public synchronized Optional<String> accessTokenForSubject(String googleSubject) {
        if (!isConfigured() || googleSubject == null || googleSubject.isBlank()) return Optional.empty();
        DriveOAuthGrant grant = grants.findById(googleSubject).filter(DriveOAuthGrant::connected).orElse(null);
        if (grant == null) {
            shortLivedTokens.remove(googleSubject);
            return Optional.empty();
        }
        CachedToken cached = shortLivedTokens.get(googleSubject);
        if (cached != null && cached.expiresAt().isAfter(clock.instant().plusSeconds(60))) {
            return Optional.of(cached.accessToken());
        }
        try {
            String refresh = cipher.decrypt(googleSubject, grant.getEncryptedRefreshToken());
            var response = tokens.refresh(refresh);
            if (response.scope() != null && !DriveOAuthConsentService.hasDriveScope(response.scope())) {
                markRevoked(googleSubject);
                return Optional.empty();
            }
            if (response.refreshToken() != null && !response.refreshToken().isBlank()) {
                grant.updateRefreshToken(cipher.encrypt(googleSubject, response.refreshToken()));
                grants.save(grant);
            }
            int seconds = response.expiresIn() == null ? 300 : Math.max(0, response.expiresIn());
            shortLivedTokens.put(googleSubject, new CachedToken(response.accessToken(), clock.instant().plusSeconds(seconds)));
            return Optional.of(response.accessToken());
        } catch (GoogleDriveOAuthTokenEndpoint.DriveOAuthTokenException error) {
            if (error.revoked()) markRevoked(googleSubject);
            return Optional.empty();
        } catch (IllegalStateException invalidStoredToken) {
            markRevoked(googleSubject);
            return Optional.empty();
        }
    }

    @Transactional
    public synchronized void disconnect(String googleSubject) {
        markRevoked(googleSubject);
    }

    @Transactional
    public synchronized void markRevoked(String googleSubject) {
        if (googleSubject == null || googleSubject.isBlank()) return;
        shortLivedTokens.remove(googleSubject);
        grants.findById(googleSubject).ifPresent(grant -> {
            grant.revoke(clock.instant());
            grants.save(grant);
        });
    }

    synchronized void cacheAccessToken(String subject, String accessToken, int expiresIn) {
        shortLivedTokens.put(subject, new CachedToken(accessToken,
            clock.instant().plusSeconds(Math.max(0, expiresIn))));
    }

    private record CachedToken(String accessToken, Instant expiresAt) {
        @Override
        public String toString() { return "CachedToken[redacted]"; }
    }
}
