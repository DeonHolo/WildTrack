package com.capvault.backend.drivehistory.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

import com.capvault.backend.auth.StoredWildTrackSession;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class DriveOAuthConsentService {
    private static final Pattern SAFE_PATH = Pattern.compile("/[A-Za-z0-9/_\\.-]{0,499}");
    private static final Pattern SAFE_QUERY = Pattern.compile("[A-Za-z0-9._~%!$&\'()*+,;=:@/?-]{0,999}");
    private static final Pattern RANDOM_VALUE = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Duration STATE_TTL = Duration.ofMinutes(5);

    private final DriveOAuthPendingStateRepository pendingStates;
    private final DriveOAuthGrantRepository grants;
    private final DriveOAuthProperties properties;
    private final DriveRefreshTokenCipher cipher;
    private final GoogleDriveOAuthTokenEndpoint tokens;
    private final DriveOAuthIdentityVerifier identities;
    private final DelegatedDriveAccessService access;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public DriveOAuthConsentService(DriveOAuthPendingStateRepository pendingStates, DriveOAuthGrantRepository grants,
                                    DriveOAuthProperties properties, DriveRefreshTokenCipher cipher,
                                    GoogleDriveOAuthTokenEndpoint tokens, DriveOAuthIdentityVerifier identities,
                                    DelegatedDriveAccessService access, Clock clock) {
        this.pendingStates = pendingStates;
        this.grants = grants;
        this.properties = properties;
        this.cipher = cipher;
        this.tokens = tokens;
        this.identities = identities;
        this.access = access;
        this.clock = clock;
    }

    public record Begin(String authorizationUrl, String nonceCookie) {
        @Override
        public String toString() { return "Begin[redacted]"; }
    }
    public record Completion(String returnPath, String status) { }

    @Transactional
    public Begin begin(StoredWildTrackSession session, String requestedReturnPath) {
        if (!properties.configured()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "Drive history consent is not configured.");
        }
        String returnPath = safeReturnPath(requestedReturnPath);
        pendingStates.deleteExpired(clock.instant());
        String state = randomValue();
        String nonce = randomValue();
        String verifier = randomValue();
        String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(
            sha256(verifier.getBytes(StandardCharsets.UTF_8)));
        pendingStates.save(new DriveOAuthPendingState(
            hash(state), hash(nonce), session.tokenHash(), session.googleSubject(), returnPath, verifier,
            clock.instant().plus(STATE_TTL)));
        String authorizationUrl = UriComponentsBuilder.fromUriString("https://accounts.google.com/o/oauth2/v2/auth")
            .queryParam("response_type", "code")
            .queryParam("client_id", properties.clientId())
            .queryParam("redirect_uri", properties.redirectUri())
            .queryParam("scope", "openid email profile " + DriveOAuthProperties.DRIVE_SCOPE)
            .queryParam("access_type", "offline")
            .queryParam("prompt", "consent")
            .queryParam("state", state)
            .queryParam("code_challenge", challenge)
            .queryParam("code_challenge_method", "S256")
            .build().encode().toUriString();
        return new Begin(authorizationUrl, nonce);
    }

    /** Pending state is consumed exactly once, including rejected/declined callbacks. */
    @Transactional
    public Completion complete(StoredWildTrackSession session, String state, String nonceCookie,
                               String code, String providerError) {
        if (!properties.configured() || session == null || state == null || !RANDOM_VALUE.matcher(state).matches()) {
            return new Completion("/", "error");
        }
        DriveOAuthPendingState pending = pendingStates.lockByStateHash(hash(state)).orElse(null);
        if (pending == null) return new Completion("/", "error");
        pendingStates.delete(pending);
        pendingStates.flush();
        String returnPath = pending.getReturnPath();
        if (nonceCookie == null || !RANDOM_VALUE.matcher(nonceCookie).matches()
            || !constantTimeEqual(pending.getNonceHash(), hash(nonceCookie))
            || !constantTimeEqual(pending.getSessionHash(), session.tokenHash())
            || !pending.getGoogleSubject().equals(session.googleSubject())
            || !pending.getExpiresAt().isAfter(clock.instant())) {
            return new Completion("/", "error");
        }
        if (providerError != null && !providerError.isBlank()) {
            return new Completion(returnPath, "access_denied".equals(providerError) ? "declined" : "error");
        }
        if (code == null || code.isBlank() || code.length() > 4096) return new Completion(returnPath, "error");
        try {
            var exchanged = tokens.exchange(code, pending.getCodeVerifier());
            // An ID token is required on the callback. Google Sign-In identity does not grant Drive scopes.
            if (exchanged.idToken() == null || exchanged.idToken().isBlank()
                || !hasDriveScope(exchanged.scope())) return new Completion(returnPath, "declined");
            String googleSubject = identities.verifiedSubject(exchanged.idToken());
            if (!session.googleSubject().equals(googleSubject)) return new Completion(returnPath, "error");

            String encrypted = exchanged.refreshToken() != null && !exchanged.refreshToken().isBlank()
                ? cipher.encrypt(googleSubject, exchanged.refreshToken()) : null;
            if (encrypted == null) {
                encrypted = grants.findById(googleSubject).filter(DriveOAuthGrant::connected)
                    .map(DriveOAuthGrant::getEncryptedRefreshToken).orElse(null);
            }
            if (encrypted == null) return new Completion(returnPath, "unavailable");
            grants.save(new DriveOAuthGrant(googleSubject, encrypted, exchanged.scope(), clock.instant()));
            access.cacheAccessToken(googleSubject, exchanged.accessToken(),
                exchanged.expiresIn() == null ? 300 : exchanged.expiresIn());
            return new Completion(returnPath, "connected");
        } catch (RuntimeException ignored) {
            // Token and provider response bodies must never reach redirects, logs, or client JSON.
            return new Completion(returnPath, "unavailable");
        }
    }

    public String redirectToUi(Completion completion) {
        return properties.frontendOrigin().replaceAll("/+$", "")
            + completion.returnPath()
            + (completion.returnPath().contains("?") ? "&" : "?")
            + "driveHistory=" + completion.status();
    }

    public static boolean hasDriveScope(String scopes) {
        return scopes != null && Arrays.asList(scopes.trim().split("\\s+")).contains(DriveOAuthProperties.DRIVE_SCOPE);
    }

    private static String safeReturnPath(String requested) {
        if (requested == null || requested.isBlank()) return "/";
        // The frontend preserves its existing workspace/selection query string
        // during the OAuth round trip. Validate the path and query separately:
        // no scheme, authority, fragment, control characters or backslashes.
        if (requested.length() > 1500 || requested.indexOf('#') >= 0
                || requested.indexOf('\\') >= 0) {
            throw new IllegalArgumentException("Return path must be a relative application path.");
        }
        int queryAt = requested.indexOf('?');
        String path = queryAt < 0 ? requested : requested.substring(0, queryAt);
        String query = queryAt < 0 ? "" : requested.substring(queryAt + 1);
        if (!SAFE_PATH.matcher(path).matches() || path.startsWith("//")
                || path.contains("..") || !SAFE_QUERY.matcher(query).matches()) {
            throw new IllegalArgumentException("Return path must be a relative application path.");
        }
        return requested;
    }

    private String randomValue() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hash(String value) {
        return HexFormat.of().formatHex(sha256(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static byte[] sha256(byte[] bytes) {
        try { return MessageDigest.getInstance("SHA-256").digest(bytes); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 unavailable."); }
    }

    private static boolean constantTimeEqual(String first, String second) {
        return MessageDigest.isEqual(first.getBytes(StandardCharsets.UTF_8), second.getBytes(StandardCharsets.UTF_8));
    }
}
