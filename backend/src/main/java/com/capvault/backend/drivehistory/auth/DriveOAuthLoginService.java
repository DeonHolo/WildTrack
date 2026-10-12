package com.capvault.backend.drivehistory.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

import com.capvault.backend.auth.DriveHistoryLoginPolicy;
import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.GoogleIdentityService;
import com.capvault.backend.auth.InvalidGoogleCredentialException;
import com.capvault.backend.auth.WildTrackSession;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.StaffAccessResolver;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

/** One Google code exchange obtains verified identity and Drive permission before app sign-in. */
@Service
public class DriveOAuthLoginService {
    private static final Pattern RANDOM_VALUE = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Duration STATE_TTL = Duration.ofMinutes(5);
    private final DriveOAuthLoginStateRepository states;
    private final DriveOAuthGrantRepository grants;
    private final DriveOAuthProperties properties;
    private final DriveRefreshTokenCipher cipher;
    private final GoogleDriveOAuthTokenEndpoint tokens;
    private final DriveOAuthIdentityVerifier identities;
    private final DelegatedDriveAccessService access;
    private final WildTrackSessionService sessions;
    private final StaffAccessResolver staff;
    private final DriveHistoryLoginPolicy policy;
    private final Clock clock;
    private final TransactionTemplate committedStep;
    private final SecureRandom random = new SecureRandom();

    public DriveOAuthLoginService(DriveOAuthLoginStateRepository states, DriveOAuthGrantRepository grants,
                                 DriveOAuthProperties properties, DriveRefreshTokenCipher cipher,
                                 GoogleDriveOAuthTokenEndpoint tokens, DriveOAuthIdentityVerifier identities,
                                 DelegatedDriveAccessService access, WildTrackSessionService sessions,
                                 StaffAccessResolver staff, DriveHistoryLoginPolicy policy, Clock clock,
                                 PlatformTransactionManager transactions) {
        this.states = states;
        this.grants = grants;
        this.properties = properties;
        this.cipher = cipher;
        this.tokens = tokens;
        this.identities = identities;
        this.access = access;
        this.sessions = sessions;
        this.staff = staff;
        this.policy = policy;
        this.clock = clock;
        this.committedStep = new TransactionTemplate(transactions);
        this.committedStep.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public record Completion(String returnPath, String status, WildTrackSession session) {
        @Override public String toString() { return "Completion[status=" + status + ", session=redacted]"; }
    }

    public DriveOAuthConsentService.Begin begin(String requestedReturnPath) {
        if (!policy.required()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,
            "Google Drive sign-in is not required.");
        if (!properties.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Google sign-in setup is unavailable. Try again later.");
        String returnPath = DriveOAuthConsentService.safeReturnPath(requestedReturnPath);
        String state = randomValue();
        String nonce = randomValue();
        String verifier = randomValue();
        String challenge = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(sha256(verifier.getBytes(StandardCharsets.UTF_8)));
        committedStep.executeWithoutResult(transaction -> {
            states.deleteExpired(clock.instant());
            states.saveAndFlush(new DriveOAuthLoginState(hash(state), hash(nonce), returnPath, verifier,
                clock.instant().plus(STATE_TTL)));
        });
        String authorization = UriComponentsBuilder.fromUriString("https://accounts.google.com/o/oauth2/v2/auth")
            .queryParam("response_type", "code").queryParam("client_id", properties.clientId())
            .queryParam("redirect_uri", properties.redirectUri())
            .queryParam("scope", "openid email profile " + DriveOAuthProperties.DRIVE_SCOPE)
            .queryParam("access_type", "offline").queryParam("prompt", "consent")
            .queryParam("state", state).queryParam("nonce", nonce)
            .queryParam("code_challenge", challenge).queryParam("code_challenge_method", "S256")
            .build().encode().toUriString();
        return new DriveOAuthConsentService.Begin(authorization, nonce);
    }

    /** An empty result means this state belongs to CONNECT or is unknown, never an implicit LOGIN. */
    public Optional<Completion> completeIfLogin(String state, String nonceCookie, String code, String providerError,
                                                List<String> priorSessionTokens) {
        if (state == null || !RANDOM_VALUE.matcher(state).matches()) return Optional.empty();
        // Commit consumption separately. Later provider/persistence/session errors cannot restore a replayable state.
        DriveOAuthLoginState pending = committedStep.execute(transaction -> {
            DriveOAuthLoginState found = states.lockByStateHash(hash(state)).orElse(null);
            if (found != null) {
                states.delete(found);
                states.flush();
            }
            return found;
        });
        if (pending == null) return Optional.empty();
        if (nonceCookie == null || !RANDOM_VALUE.matcher(nonceCookie).matches()
            || !MessageDigest.isEqual(pending.getNonceHash().getBytes(StandardCharsets.UTF_8),
                hash(nonceCookie).getBytes(StandardCharsets.UTF_8))
            || !pending.getExpiresAt().isAfter(clock.instant())) {
            return Optional.of(failed("/", "error"));
        }
        String returnPath = pending.getReturnPath();
        if (providerError != null && !providerError.isBlank()) {
            return Optional.of(failed(returnPath, "access_denied".equals(providerError) ? "declined" : "error"));
        }
        if (!policy.required() || !properties.configured()) return Optional.of(failed(returnPath, "unavailable"));
        if (code == null || code.isBlank() || code.length() > 4096) return Optional.of(failed(returnPath, "error"));
        try {
            var exchanged = tokens.exchange(code, pending.getCodeVerifier());
            if (exchanged.idToken() == null || exchanged.idToken().isBlank() || !hasLoginScopes(exchanged.scope())) {
                return Optional.of(failed(returnPath, "declined"));
            }
            GoogleIdentity identity = GoogleIdentityService.normalize(identities.verifiedIdentity(exchanged.idToken(), nonceCookie));
            if (identity == null || identity.subject() == null || identity.subject().isBlank()
                || identity.subject().length() > 255 || identity.email() == null || identity.email().isBlank()
                || identity.email().length() > 320) return Optional.of(failed(returnPath, "error"));
            String encrypted = exchanged.refreshToken() != null && !exchanged.refreshToken().isBlank()
                ? cipher.encrypt(identity.subject(), exchanged.refreshToken()) : null;
            if (encrypted == null && access.connected(identity.subject())) {
                encrypted = grants.findById(identity.subject()).filter(DriveOAuthGrant::connected)
                    .map(DriveOAuthGrant::getEncryptedRefreshToken).orElse(null);
            }
            if (encrypted == null || encrypted.length() > 2048 || exchanged.scope().length() > 2048
                || exchanged.accessToken() == null || exchanged.accessToken().isBlank()) {
                return Optional.of(failed(returnPath, "unavailable"));
            }
            String storedToken = encrypted;
            // The usable grant is committed before role binding or any application session is created.
            committedStep.executeWithoutResult(transaction -> grants.saveAndFlush(new DriveOAuthGrant(
                identity.subject(), storedToken, exchanged.scope(), clock.instant())));
            WildTrackSession created = committedStep.execute(transaction -> {
                staff.onBindLogin(identity.subject(), identity.email());
                WildTrackSession fresh = sessions.create(identity);
                for (String previous : priorSessionTokens) sessions.revoke(previous);
                return fresh;
            });
            access.cacheAccessToken(identity.subject(), exchanged.accessToken(),
                exchanged.expiresIn() == null ? 300 : exchanged.expiresIn());
            return Optional.of(new Completion(returnPath, "connected", created));
        } catch (IllegalArgumentException | InvalidGoogleCredentialException invalidIdentity) {
            return Optional.of(failed(returnPath, "error"));
        } catch (RuntimeException unavailable) {
            // Never expose provider bodies, tokens, or persistence diagnostics in the browser redirect.
            return Optional.of(failed(returnPath, "unavailable"));
        }
    }

    public String redirectToUi(Completion completion) {
        String origin = properties.frontendOrigin().replaceAll("/+$", "");
        if (completion.session() != null) {
            return origin + completion.returnPath() + (completion.returnPath().contains("?") ? "&" : "?")
                + "driveHistory=connected";
        }
        return origin + "/login?driveHistory=" + completion.status() + "&returnTo="
            + UriUtils.encode(completion.returnPath(), StandardCharsets.UTF_8);
    }

    public Completion failed(String returnPath, String status) { return new Completion(returnPath, status, null); }

    static boolean hasLoginScopes(String scopes) {
        if (scopes == null) return false;
        Set<String> granted = Set.copyOf(java.util.Arrays.asList(scopes.trim().split("\\s+")));
        return granted.contains("openid") && granted.contains(DriveOAuthProperties.DRIVE_SCOPE)
            && (granted.contains("email") || granted.contains("https://www.googleapis.com/auth/userinfo.email"))
            && (granted.contains("profile") || granted.contains("https://www.googleapis.com/auth/userinfo.profile"));
    }

    private String randomValue() {
        byte[] value = new byte[32];
        random.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private static String hash(String value) { return HexFormat.of().formatHex(sha256(value.getBytes(StandardCharsets.UTF_8))); }

    private static byte[] sha256(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (java.security.NoSuchAlgorithmException unavailable) { throw new IllegalStateException("SHA-256 unavailable."); }
    }
}
