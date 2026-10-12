package com.capvault.backend.drivehistory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.GoogleIdentityService;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.drivehistory.auth.DriveOAuthGrant;
import com.capvault.backend.drivehistory.auth.DriveOAuthGrantRepository;
import com.capvault.backend.drivehistory.auth.DriveOAuthIdentityVerifier;
import com.capvault.backend.drivehistory.auth.DriveOAuthProperties;
import com.capvault.backend.drivehistory.auth.DriveRefreshTokenCipher;
import com.capvault.backend.drivehistory.auth.GoogleDriveOAuthTokenEndpoint;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Exercises the real security chain and persisted grants with provider calls replaced by mocks. */
@SpringBootTest(properties = {
    "wildtrack.drive-history.required-for-login=true",
    "wildtrack.drive-history.oauth.enabled=true",
    "wildtrack.drive-history.oauth.client-id=mock-web-client",
    "wildtrack.drive-history.oauth.client-secret=mock-secret",
    "wildtrack.drive-history.oauth.redirect-uri=http://localhost:8080/api/drive-history/auth/callback",
    "wildtrack.drive-history.oauth.frontend-origin=http://localhost:5173",
    "wildtrack.drive-history.oauth.encryption-key-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(DriveHistoryRequiredLoginIntegrationTest.ProbeConfiguration.class)
@Transactional
class DriveHistoryRequiredLoginIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;
    @Autowired DriveOAuthGrantRepository grants;
    @Autowired DriveRefreshTokenCipher cipher;
    @Autowired DelegatedDriveAccessService access;
    @Autowired StaffRoleAssignmentRepository staffRoles;
    @Autowired ProbeController probe;
    @MockBean GoogleIdentityService identity;
    @MockBean GoogleDriveOAuthTokenEndpoint tokens;
    @MockBean DriveOAuthIdentityVerifier driveIdentities;

    @BeforeEach
    void resetProbe() { probe.writes.set(0); }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void pendingStudentAndAdministratorCannotReadOrWriteApplicationData(boolean administrator) throws Exception {
        String subject = "pending-" + UUID.randomUUID();
        Cookie session = session(subject, administrator);
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.driveHistoryRequired").value(true))
            .andExpect(jsonPath("$.driveHistoryConfigured").value(true))
            .andExpect(jsonPath("$.driveHistoryConnected").value(false));
        mvc.perform(get("/api/workspaces").cookie(session))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        var rejection = mvc.perform(post("/api/login-gate-test/write").cookie(session).with(csrf()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"))
            .andReturn().getResponse();
        mvc.perform(post("/api/workspaces").cookie(session).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        assertThat(rejection.getContentAsString()).doesNotContain(subject, session.getValue(), "@example.invalid");
        assertThat(probe.writes).hasValue(0);
        verifyNoInteractions(tokens, driveIdentities);
    }

    @Test
    void identityOnlyExchangeCannotCreateLoginWhileExistingPendingIdentityCanLogout() throws Exception {
        mvc.perform(post("/api/auth/google/session")
                .contentType(MediaType.APPLICATION_JSON).content("{\"credential\":\"mock-credential\"}"))
            .andExpect(status().isConflict()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        Cookie session = session("prior-identity-" + UUID.randomUUID(), false);
        mvc.perform(get("/api/login-gate-test/read").cookie(session))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        mvc.perform(post("/api/auth/logout").cookie(session).with(csrf()))
            .andExpect(status().isOk()).andExpect(cookie().maxAge("WILDTRACK_SESSION", 0));
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(false));
        verifyNoInteractions(identity, tokens, driveIdentities);
    }

    @Test
    void publicReadStaysAvailableButAuthenticatedAndAnonymousPublicMutationsCannotBypassGate() throws Exception {
        Cookie session = session("public-pending-" + UUID.randomUUID(), false);
        mvc.perform(get("/api/public/forms/login-gate-test"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/public/forms/login-gate-test").cookie(session))
            .andExpect(status().isOk());
        mvc.perform(post("/api/public/forms/login-gate-test").cookie(session).with(csrf()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        mvc.perform(post("/api/public/forms/login-gate-test").with(csrf()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        mvc.perform(post("/api/public/forms").with(csrf()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        assertThat(probe.writes).hasValue(0);
    }

    @Test
    void usableOwnSavedGrantUnlocksRequestsAndDisconnectClosesTheSameExistingSession() throws Exception {
        String subject = "connected-" + UUID.randomUUID();
        Cookie session = session(subject, false);
        saveGrant(subject, cipher.encrypt(subject, "refresh-token"), DriveOAuthProperties.DRIVE_SCOPE);
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.driveHistoryConnected").value(true));
        mvc.perform(get("/api/workspaces").cookie(session)).andExpect(status().isOk());
        mvc.perform(post("/api/login-gate-test/write").cookie(session).with(csrf()))
            .andExpect(status().isOk());
        mvc.perform(post("/api/public/forms/login-gate-test").cookie(session).with(csrf()))
            .andExpect(status().isOk());
        assertThat(probe.writes).hasValue(2);
        mvc.perform(post("/api/drive-history/auth/disconnect").cookie(session).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.required").value(true))
            .andExpect(jsonPath("$.connected").value(false));
        assertPending(session);
        verifyNoInteractions(tokens, driveIdentities);
    }

    @Test
    void corruptRotatedMissingScopeAndRevokedSavedGrantsCannotUnlockLogin() throws Exception {
        for (String kind : java.util.List.of("corrupt", "rotated", "scope", "revoked", "missing")) {
            String subject = kind + "-" + UUID.randomUUID();
            Cookie session = session(subject, false);
            String encrypted = cipher.encrypt(subject, "refresh-token");
            if ("corrupt".equals(kind)) encrypted = "v1.not-a-valid-ciphertext";
            if ("rotated".equals(kind)) {
                byte[] rotatedKey = new byte[32];
                Arrays.fill(rotatedKey, (byte) 1);
                var oldCipher = new DriveRefreshTokenCipher(new DriveOAuthProperties(true, "client", "secret",
                    "http://localhost:8080/api/drive-history/auth/callback", "http://localhost:5173",
                    Base64.getEncoder().encodeToString(rotatedKey), false));
                encrypted = oldCipher.encrypt(subject, "refresh-token");
            }
            DriveOAuthGrant grant = new DriveOAuthGrant(subject, "missing".equals(kind) ? null : encrypted,
                "scope".equals(kind) ? "openid email" : DriveOAuthProperties.DRIVE_SCOPE, Instant.now());
            if ("revoked".equals(kind)) grant.revoke(Instant.now());
            grants.saveAndFlush(grant);
            assertPending(session);
        }
        verifyNoInteractions(tokens, driveIdentities);
    }

    @Test
    void anotherSubjectsGrantAndSecondDuplicateCookieCannotUnlockPendingIdentity() throws Exception {
        String connectedSubject = "other-connected-" + UUID.randomUUID();
        Cookie connected = session(connectedSubject, false);
        Cookie pending = session("own-pending-" + UUID.randomUUID(), false);
        saveGrant(connectedSubject, cipher.encrypt(connectedSubject, "refresh-token"), DriveOAuthProperties.DRIVE_SCOPE);
        assertPending(pending);
        mvc.perform(get("/api/login-gate-test/read").cookie(pending, connected))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        mvc.perform(get("/api/login-gate-test/read").cookie(connected, pending))
            .andExpect(status().isOk());
        verifyNoInteractions(tokens, driveIdentities);
    }

    @Test
    void discoveredProviderRevocationClosesTheExistingSessionOnNextRequest() throws Exception {
        String subject = "remotely-revoked-" + UUID.randomUUID();
        Cookie session = session(subject, false);
        saveGrant(subject, cipher.encrypt(subject, "revoked-refresh"), DriveOAuthProperties.DRIVE_SCOPE);
        mvc.perform(get("/api/login-gate-test/read").cookie(session)).andExpect(status().isOk());
        when(tokens.refresh("revoked-refresh"))
            .thenThrow(new GoogleDriveOAuthTokenEndpoint.DriveOAuthTokenException(true));
        assertThat(access.accessTokenForSubject(subject)).isEmpty();
        assertPending(session);
    }

    @Test
    void recoveryExceptionsAreExactMethodsAndDoNotReplaceCsrfProtection() throws Exception {
        Cookie session = session("recovery-" + UUID.randomUUID(), false);
        mvc.perform(get("/api/drive-history/auth/status").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.required").value(true));
        mvc.perform(get("/api/auth/logout").cookie(session))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        mvc.perform(post("/api/auth/google").cookie(session).with(csrf()))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
        mvc.perform(post("/api/drive-history/auth/disconnect").cookie(session))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").doesNotExist());
        mvc.perform(get("/api/login-gate-test/read"))
            .andExpect(status().isUnauthorized());
    }

    private void assertPending(Cookie session) throws Exception {
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.driveHistoryConnected").value(false));
        mvc.perform(get("/api/login-gate-test/read").cookie(session))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("DRIVE_HISTORY_REQUIRED"));
    }

    private Cookie session(String subject, boolean administrator) {
        String email = subject + "@example.invalid";
        var created = sessions.create(new GoogleIdentity(subject, email, "Student", ""));
        if (administrator) staffRoles.saveAndFlush(new StaffRoleAssignment(UUID.randomUUID(), subject, email,
            StaffRole.ADMIN, true, Instant.now(), Instant.now()));
        return new Cookie("WILDTRACK_SESSION", created.rawToken());
    }

    private void saveGrant(String subject, String encrypted, String scopes) {
        grants.saveAndFlush(new DriveOAuthGrant(subject, encrypted, scopes, Instant.now()));
    }

    @TestConfiguration
    static class ProbeConfiguration {
        @Bean ProbeController loginGateProbe() { return new ProbeController(); }
    }

    /** Test routes make application execution and a future public submission mutation observable. */
    @RestController
    @TestComponent
    static class ProbeController {
        final AtomicInteger writes = new AtomicInteger();
        @GetMapping({"/api/login-gate-test/read", "/api/public/forms/login-gate-test"})
        String read() { return "visible"; }
        @PostMapping({"/api/login-gate-test/write", "/api/public/forms/login-gate-test"})
        String write() { writes.incrementAndGet(); return "saved"; }
    }
}
