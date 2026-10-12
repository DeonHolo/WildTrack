package com.capvault.backend.drivehistory.auth;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class DriveOAuthLoginController {
    private final DriveOAuthLoginService login;
    private final DriveOAuthProperties properties;

    public DriveOAuthLoginController(DriveOAuthLoginService login, DriveOAuthProperties properties) {
        this.login = login;
        this.properties = properties;
    }

    @GetMapping("/api/auth/google/start")
    public ResponseEntity<Void> start(@RequestParam(defaultValue = "/") String returnTo) {
        DriveOAuthConsentService.Begin begun;
        try {
            begun = login.begin(returnTo);
        } catch (ResponseStatusException unavailable) {
            if (unavailable.getStatusCode().value() != HttpStatus.SERVICE_UNAVAILABLE.value()) throw unavailable;
            String destination;
            try { destination = DriveOAuthConsentService.safeReturnPath(returnTo); }
            catch (IllegalArgumentException unsafeDestination) { destination = "/"; }
            return ResponseEntity.status(HttpStatus.SEE_OTHER)
                .header(HttpHeaders.LOCATION, login.redirectToUi(login.failed(destination, "unavailable")))
                .cacheControl(CacheControl.noStore()).build();
        }
        var nonceCookie = ResponseCookie.from(DriveOAuthController.STATE_COOKIE, begun.nonceCookie())
            .httpOnly(true).secure(properties.secureCookie()).sameSite("Lax")
            .path("/api/drive-history/auth/callback").maxAge(Duration.ofMinutes(5)).build();
        return ResponseEntity.status(HttpStatus.SEE_OTHER)
            .header(HttpHeaders.LOCATION, begun.authorizationUrl())
            .header(HttpHeaders.SET_COOKIE, nonceCookie.toString())
            .cacheControl(CacheControl.noStore()).build();
    }
}
