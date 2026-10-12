package com.capvault.backend.auth;

import java.time.Clock;
import java.time.Instant;

import com.capvault.backend.config.WildTrackSessionProperties;
import com.capvault.backend.staff.StaffAccessResolver;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class WildTrackSessionController {

    static final String SESSION_COOKIE = "WILDTRACK_SESSION";

    private final GoogleIdentityService googleIdentityService;
    private final WildTrackSessionService sessionService;
    private final Clock clock;
    private final WildTrackSessionProperties properties;
    private final StaffAccessResolver staffAccessResolver;
    private final DriveHistoryLoginPolicy driveHistoryLogin;

    WildTrackSessionController(
        GoogleIdentityService googleIdentityService,
        WildTrackSessionService sessionService,
        Clock clock,
        WildTrackSessionProperties properties,
        StaffAccessResolver staffAccessResolver,
        DriveHistoryLoginPolicy driveHistoryLogin
    ) {
        this.googleIdentityService = googleIdentityService;
        this.sessionService = sessionService;
        this.clock = clock;
        this.properties = properties;
        this.staffAccessResolver = staffAccessResolver;
        this.driveHistoryLogin = driveHistoryLogin;
    }

    public record SessionExchangeRequest(@NotBlank String credential) {
    }

    public record CurrentSessionResponse(
        boolean authenticated,
        String email,
        String name,
        Instant expiresAt,
        java.util.List<String> roles,
        boolean driveHistoryRequired,
        boolean driveHistoryConnected,
        boolean driveHistoryConfigured,
        String googleSubject
    ) {
        static CurrentSessionResponse anonymous(DriveHistoryLoginPolicy.Status drive) {
            return new CurrentSessionResponse(false, null, null, null, java.util.List.of(),
                drive.required(), false, drive.configured(), null);
        }
    }

    @PostMapping("/google/session")
    ResponseEntity<GoogleIdentity> exchange(
        @Valid @RequestBody SessionExchangeRequest request,
        HttpServletResponse response
    ) {
        if (driveHistoryLogin.required()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "Use Google sign-in with Drive history permission to finish signing in.");
        }
        GoogleIdentity identity = googleIdentityService.authenticate(request.credential());
        staffAccessResolver.onBindLogin(identity.subject(), identity.email());
        WildTrackSession created = sessionService.create(identity);
        writeSessionCookie(response, created.rawToken(), properties);
        return ResponseEntity.ok(identity);
    }

    @GetMapping("/session")
    ResponseEntity<CurrentSessionResponse> current(HttpServletRequest request) {
        StoredWildTrackSession session = request.getAttribute(WildTrackSessionAuthenticationFilter.RESOLVED_SESSION_ATTRIBUTE)
            instanceof StoredWildTrackSession resolved ? resolved : null;
        if (session == null && request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if (!SESSION_COOKIE.equals(cookie.getName())) continue;
                session = sessionService.resolve(cookie.getValue()).orElse(null);
                break;
            }
        }
        if (session == null) {
            return ResponseEntity.ok(CurrentSessionResponse.anonymous(driveHistoryLogin.status(null)));
        }
        var drive = driveHistoryLogin.status(session.googleSubject());
        var roles = staffAccessResolver.activeRolesFor(session.googleSubject()).stream().map(Enum::name).toList();
        return ResponseEntity.ok(new CurrentSessionResponse(true, session.googleEmail(), null, session.expiresAt(), roles,
            drive.required(), drive.connected(), drive.configured(), session.googleSubject()));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (SESSION_COOKIE.equals(cookie.getName())) {
                    sessionService.revoke(cookie.getValue());
                }
            }
        }
        Cookie cleared = new Cookie(SESSION_COOKIE, "");
        configureSessionCookie(cleared);
        cleared.setMaxAge(0);
        response.addCookie(cleared);
        return ResponseEntity.ok().build();
    }

    private void configureSessionCookie(Cookie cookie) {
        configureSessionCookie(cookie, properties);
    }

    public static void writeSessionCookie(HttpServletResponse response, String rawToken,
                                         WildTrackSessionProperties properties) {
        Cookie cookie = new Cookie(SESSION_COOKIE, rawToken);
        configureSessionCookie(cookie, properties);
        cookie.setMaxAge((int) properties.ttl().toSeconds());
        response.addCookie(cookie);
    }

    private static void configureSessionCookie(Cookie cookie, WildTrackSessionProperties properties) {
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        if (properties.secure()) {
            cookie.setSecure(true);
        }
        String domain = properties.cookieDomain();
        if (domain != null && !domain.isBlank()) {
            cookie.setDomain(domain.trim());
        }
    }
}
