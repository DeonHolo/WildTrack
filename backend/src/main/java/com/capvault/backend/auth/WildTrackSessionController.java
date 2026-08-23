package com.capvault.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import com.capvault.backend.config.WildTrackSessionProperties;
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

    WildTrackSessionController(
        GoogleIdentityService googleIdentityService,
        WildTrackSessionService sessionService,
        Clock clock,
        WildTrackSessionProperties properties
    ) {
        this.googleIdentityService = googleIdentityService;
        this.sessionService = sessionService;
        this.clock = clock;
        this.properties = properties;
    }

    public record SessionExchangeRequest(@NotBlank String credential) {
    }

    public record CurrentSessionResponse(
        boolean authenticated,
        String email,
        String name,
        Instant expiresAt
    ) {
        static CurrentSessionResponse anonymous() {
            return new CurrentSessionResponse(false, null, null, null);
        }
    }

    @PostMapping("/google/session")
    ResponseEntity<GoogleIdentity> exchange(
        @Valid @RequestBody SessionExchangeRequest request,
        HttpServletResponse response
    ) {
        GoogleIdentity identity = googleIdentityService.authenticate(request.credential());
        Duration ttl = properties.ttl();
        WildTrackSession created = sessionService.create(identity);
        Cookie cookie = new Cookie(SESSION_COOKIE, created.rawToken());
        cookie.setHttpOnly(true);
        cookie.setPath("/");
        cookie.setMaxAge((int) ttl.toSeconds());
        if (properties.secure()) {
            cookie.setSecure(true);
        }
        response.addCookie(cookie);
        return ResponseEntity.ok(identity);
    }

    @GetMapping("/session")
    ResponseEntity<CurrentSessionResponse> current(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return ResponseEntity.ok(CurrentSessionResponse.anonymous());
        }
        for (Cookie cookie : cookies) {
            if (!SESSION_COOKIE.equals(cookie.getName())) continue;
            return sessionService.resolve(cookie.getValue())
                .map(session -> ResponseEntity.ok(new CurrentSessionResponse(
                    true,
                    session.googleEmail(),
                    null,
                    session.expiresAt()
                )))
                .orElseGet(() -> ResponseEntity.ok(CurrentSessionResponse.anonymous()));
        }
        return ResponseEntity.ok(CurrentSessionResponse.anonymous());
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
        cleared.setHttpOnly(true);
        cleared.setPath("/");
        cleared.setMaxAge(0);
        response.addCookie(cleared);
        return ResponseEntity.ok().build();
    }
}
