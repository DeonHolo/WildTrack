package com.capvault.backend.drivehistory.auth;

import java.time.Duration;

import com.capvault.backend.auth.StoredWildTrackSession;
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

    public DriveOAuthController(StudentAssociationSecurity sessions, DriveOAuthConsentService consent,
                                DelegatedDriveAccessService access, DriveOAuthProperties properties) {
        this.sessions = sessions;
        this.consent = consent;
        this.access = access;
        this.properties = properties;
    }

    public record Status(boolean configured, boolean connected, String message) { }

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
                                         HttpServletRequest request) {
        StoredWildTrackSession session;
        try { session = sessions.requireSession(request); }
        catch (RuntimeException invalidSession) { session = null; }
        var completed = consent.complete(session, state, cookieValue(request, STATE_COOKIE), code, error);
        return ResponseEntity.status(HttpStatus.SEE_OTHER)
            .header(HttpHeaders.LOCATION, consent.redirectToUi(completed))
            .header(HttpHeaders.SET_COOKIE, stateCookie("", Duration.ZERO).toString())
            .cacheControl(CacheControl.noStore())
            .build();
    }

    @GetMapping("/status")
    public Status status(HttpServletRequest request) {
        String subject = sessions.requireSession(request).googleSubject();
        boolean configured = access.isConfigured();
        boolean connected = access.connected(subject);
        return new Status(configured, connected,
            connected ? "Google Drive history consent is connected."
                : configured ? "Google Drive history is optional and currently disconnected."
                : "Google Drive history consent is not configured.");
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
