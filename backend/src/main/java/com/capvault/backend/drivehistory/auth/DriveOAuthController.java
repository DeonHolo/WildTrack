package com.capvault.backend.drivehistory.auth;

import java.time.Duration;

import com.capvault.backend.auth.StoredWildTrackSession;
import com.capvault.backend.auth.DriveHistoryLoginPolicy;
import com.capvault.backend.auth.WildTrackSessionController;
import com.capvault.backend.config.WildTrackSessionProperties;
import com.capvault.backend.student.StudentAssociationSecurity;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/drive-history/auth")
public class DriveOAuthController {
    static final String STATE_COOKIE = "WILDTRACK_DRIVE_OAUTH";
    private static final String CALLBACK_PATH = "/api/drive-history/auth/callback";

    private final StudentAssociationSecurity sessions;
    private final DriveOAuthConsentService consent;
    private final DelegatedDriveAccessService access;
    private final DriveOAuthProperties properties;
    private final DriveHistoryLoginPolicy loginPolicy;
    private final DriveOAuthLoginService login;
    private final WildTrackSessionProperties sessionProperties;

    public DriveOAuthController(StudentAssociationSecurity sessions, DriveOAuthConsentService consent,
                                DelegatedDriveAccessService access, DriveOAuthProperties properties,
                                DriveHistoryLoginPolicy loginPolicy, DriveOAuthLoginService login,
                                WildTrackSessionProperties sessionProperties) {
        this.sessions = sessions;
        this.consent = consent;
        this.access = access;
        this.properties = properties;
        this.loginPolicy = loginPolicy;
        this.login = login;
        this.sessionProperties = sessionProperties;
    }

    public record Status(boolean configured, boolean connected, boolean required, String message) { }

    @GetMapping("/start")
    public ResponseEntity<Void> start(@RequestParam(defaultValue = "/") String returnTo,
                                      HttpServletRequest request) {
        var begun = consent.begin(sessions.requireSession(request), returnTo);
        return ResponseEntity.status(HttpStatus.SEE_OTHER)
            .header(HttpHeaders.LOCATION, begun.authorizationUrl())
            .header(HttpHeaders.SET_COOKIE, stateCookie(begun.nonceCookie(), Duration.ofMinutes(5)).toString())
            .cacheControl(CacheControl.noStore())
            .build();
    }

    /** Public entry point for Google's redirect; session and state remain mandatory in the service. */
    @GetMapping("/callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String state,
                                         @RequestParam(required = false) String code,
                                         @RequestParam(required = false) String error,
                                         HttpServletRequest request, HttpServletResponse response) {
        try {
            var loginResult = login.completeIfLogin(state, cookieValue(request, STATE_COOKIE), code, error,
                sessionTokens(request));
            if (loginResult.isPresent()) {
                var completedLogin = loginResult.get();
                if (completedLogin.session() != null) {
                    // The service has committed grant and identity/session storage before issuing this cookie.
                    WildTrackSessionController.writeSessionCookie(response, completedLogin.session().rawToken(), sessionProperties);
                }
                return callbackRedirect(login.redirectToUi(completedLogin));
            }
        } catch (RuntimeException unavailableLoginState) {
            return callbackRedirect(login.redirectToUi(login.failed("/", "unavailable")));
        }
        if (loginPolicy.required() && !consent.hasPendingConnectState(state)) {
            return callbackRedirect(login.redirectToUi(login.failed("/", "error")));
        }
        StoredWildTrackSession session;
        try { session = sessions.requireSession(request); }
        catch (RuntimeException invalidSession) { session = null; }
        if (session == null) return callbackRedirect(login.redirectToUi(login.failed("/", "error")));
        var completed = consent.complete(session, state, cookieValue(request, STATE_COOKIE), code, error);
        return callbackRedirect(consent.redirectToUi(completed));
    }

    private ResponseEntity<Void> callbackRedirect(String location) {
        return ResponseEntity.status(HttpStatus.SEE_OTHER)
            .header(HttpHeaders.LOCATION, location)
            .header(HttpHeaders.SET_COOKIE, stateCookie("", Duration.ZERO).toString())
            .cacheControl(CacheControl.noStore())
            .build();
    }

    private static java.util.List<String> sessionTokens(HttpServletRequest request) {
        if (request.getCookies() == null) return java.util.List.of();
        return java.util.Arrays.stream(request.getCookies())
            .filter(cookie -> "WILDTRACK_SESSION".equals(cookie.getName()))
            .map(Cookie::getValue).toList();
    }

    @GetMapping("/status")
    public Status status(HttpServletRequest request) {
        String subject = sessions.requireSession(request).googleSubject();
        var state = loginPolicy.status(subject);
        String message = state.connected() ? "Google Drive history permission is connected."
            : !state.configured() ? (state.required()
                ? "Google Drive history permission is required to finish signing in, but setup is unavailable. Try again later."
                : "Google Drive history permission is optional and is not configured.")
            : state.required() ? "Google Drive history permission is required to finish signing in."
                : "Google Drive history permission is optional and currently disconnected.";
        return new Status(state.configured(), state.connected(), state.required(), message);
    }

    @PostMapping("/disconnect")
    public Status disconnect(HttpServletRequest request) {
        String subject = sessions.requireSession(request).googleSubject();
        access.disconnect(subject);
        return status(request);
    }

    private ResponseCookie stateCookie(String nonce, Duration duration) {
        return ResponseCookie.from(STATE_COOKIE, nonce)
            .httpOnly(true).secure(properties.secureCookie()).sameSite("Lax")
            .path(CALLBACK_PATH).maxAge(duration).build();
    }

    private static String cookieValue(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie cookie : request.getCookies()) if (name.equals(cookie.getName())) return cookie.getValue();
        return null;
    }
}
