package com.capvault.backend.auth;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class GoogleAuthController {

    private final GoogleIdentityService service;

    public GoogleAuthController(GoogleIdentityService service) {
        this.service = service;
    }

    @PostMapping("/google")
    ResponseEntity<GoogleIdentity> authenticateGoogle(@Valid @RequestBody GoogleAuthRequest request) {
        return ResponseEntity.ok(service.authenticate(request.credential()));
    }
}
