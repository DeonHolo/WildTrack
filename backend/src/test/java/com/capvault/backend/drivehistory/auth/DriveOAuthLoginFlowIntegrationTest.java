package com.capvault.backend.drivehistory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionJpaRepository;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.StaffAccessResolver;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Real committed LOGIN state, grant, and session transactions; Google endpoints are mocked. */
@SpringBootTest(properties = {
    "wildtrack.drive-history.required-for-login=true",
    "wildtrack.drive-history.oauth.enabled=true",
    "wildtrack.drive-history.oauth.client-id=mock-drive-web-client",
    "wildtrack.drive-history.oauth.client-secret=mock-secret",
    "wildtrack.drive-history.oauth.redirect-uri=http://localhost:8080/api/drive-history/auth/callback",
    "wildtrack.drive-history.oauth.frontend-origin=http://localhost:5173",
    "wildtrack.drive-history.oauth.encryption-key-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(DriveHistoryRequiredLoginIntegrationTest.ProbeConfiguration.class)
class DriveOAuthLoginFlowIntegrationTest {
    private static final String FULL_SCOPES = "openid email profile " + DriveOAuthProperties.DRIVE_SCOPE;
    private static final AtomicInteger CLIENTS = new AtomicInteger();
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;
    @Autowired WildTrackSessionJpaRepository sessionRows;
    @Autowired DriveOAuthLoginStateRepository loginStates;
    @Autowired DriveOAuthPendingStateRepository connectStates;
    @Autowired DriveRefreshTokenCipher cipher;
    @Autowired DelegatedDriveAccessService access;
    @SpyBean DriveOAuthGrantRepository grants;
    @SpyBean StaffAccessResolver staff;
    @MockBean GoogleDriveOAuthTokenEndpoint tokens;
    @MockBean DriveOAuthIdentityVerifier identities;
    private String subject;
    private long sessionCountBefore;
    private final java.util.List<String> createdTokens = new java.util.ArrayList<>();
    private final java.util.List<String> addedGrants = new java.util.ArrayList<>();

    @BeforeEach
    void providerResponse() {
        subject = "login-flow-" + UUID.randomUUID();
        sessionCountBefore = sessionRows.count();
        when(tokens.exchange(anyString(), anyString())).thenReturn(response("refresh-token", FULL_SCOPES));
        when(identities.verifiedIdentity(eq("signed-login-token"), anyString()))
            .thenReturn(new GoogleIdentity(subject, " Student@Example.Invalid ", " Student ", ""));
        when(identities.verifiedSubject("signed-login-token")).thenReturn(subject);
    }

    @AfterEach
    void removeOwnCommittedData() {
        for (String token : createdTokens) sessions.revoke(token);
        grants.deleteById(subject);
        for (String added : addedGrants) grants.deleteById(added);
        loginStates.deleteAll();
        connectStates.deleteAll();
    }

    @Test
    void anonymousGoogleRoundTripSavesUsableGrantBeforeIssuingIdentitySession() throws Exception {
        Started started = begin("/student?workspaceId=abc-123");
        assertThat(started.params()).containsEntry("client_id", "mock-drive-web-client")
            .containsEntry("scope", FULL_SCOPES).containsEntry("response_type", "code")
            .containsEntry("nonce", started.nonce().getValue()).containsEntry("code_challenge_method", "S256");
        assertThat(loginStates.count()).isEqualTo(1);
        assertThat(connectStates.count()).isZero();
        var savedState = loginStates.findById(hash(started.state())).orElseThrow();
        String expectedChallenge = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(MessageDigest.getInstance("SHA-256").digest(savedState.getCodeVerifier().getBytes(StandardCharsets.UTF_8)));
        assertThat(started.params()).containsEntry("code_challenge", expectedChallenge);
        assertThat(savedState.getNonceHash()).isEqualTo(hash(started.nonce().getValue()));
        assertThat(sessionRows.count()).isEqualTo(sessionCountBefore);

        var completed = callback(started).andExpect(status().isSeeOther())
            .andExpect(header().string(HttpHeaders.LOCATION,
                "http://localhost:5173/student?workspaceId=abc-123&driveHistory=connected"))
            .andExpect(cookie().httpOnly("WILDTRACK_SESSION", true)).andReturn().getResponse();
        Cookie session = completed.getCookie("WILDTRACK_SESSION");
        createdTokens.add(session.getValue());
        assertThat(loginStates.count()).isZero();
        assertThat(access.connected(subject)).isTrue();
        assertThat(sessionRows.count()).isEqualTo(sessionCountBefore + 1);
        assertThat(grants.findById(subject).orElseThrow().getEncryptedRefreshToken())
            .doesNotContain("refresh-token");
        verify(tokens).exchange("provider-code", savedState.getCodeVerifier());
        verify(identities).verifiedIdentity("signed-login-token", started.nonce().getValue());
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.googleSubject").value(subject))
            .andExpect(jsonPath("$.email").value("student@example.invalid"))
            .andExpect(jsonPath("$.driveHistoryConnected").value(true));
        mvc.perform(get("/api/login-gate-test/read").cookie(session)).andExpect(status().isOk());

        callback(started).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andExpect(header().string(HttpHeaders.LOCATION, "http://localhost:5173/login?driveHistory=error&returnTo=%2F"));
        mvc.perform(get("/api/drive-history/auth/callback").param("state", started.state())
                .param("code", "provider-code").cookie(started.nonce(), session))
            .andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andExpect(header().string(HttpHeaders.LOCATION, "http://localhost:5173/login?driveHistory=error&returnTo=%2F"));
        assertThat(sessionRows.count()).isEqualTo(sessionCountBefore + 1);
    }

    @Test
    void denialKeepsSafeReturnDestinationAndIssuesNoApplicationSessionOrRoleBinding() throws Exception {
        Started started = begin("/submit/original-form?workspaceId=abc-123");
        mvc.perform(get("/api/drive-history/auth/callback").param("state", started.state())
                .param("error", "access_denied").cookie(started.nonce()))
            .andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andExpect(header().string(HttpHeaders.LOCATION,
                "http://localhost:5173/login?driveHistory=declined&returnTo=%2Fsubmit%2Foriginal-form%3FworkspaceId%3Dabc-123"));
        assertNoLogin();
        verifyNoInteractions(tokens, identities);
        verify(staff, never()).onBindLogin(anyString(), anyString());
    }

    @Test
    void partialScopesMissingIdTokenAndMissingRefreshDoNotCreateLogin() throws Exception {
        for (String scopes : java.util.List.of("openid email profile", "openid email " + DriveOAuthProperties.DRIVE_SCOPE,
                "openid profile " + DriveOAuthProperties.DRIVE_SCOPE)) {
            Started started = begin("/student");
            when(tokens.exchange(anyString(), anyString())).thenReturn(response("refresh-token", scopes));
            callback(started).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
            assertNoLogin();
        }
        Started missingIdentity = begin("/student");
        when(tokens.exchange(anyString(), anyString())).thenReturn(new GoogleDriveOAuthTokenEndpoint.TokenResponse(
            "access", "refresh-token", null, FULL_SCOPES, 300));
        callback(missingIdentity).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertNoLogin();
        Started missingRefresh = begin("/student");
        when(tokens.exchange(anyString(), anyString())).thenReturn(response(null, FULL_SCOPES));
        callback(missingRefresh).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andExpect(header().string(HttpHeaders.LOCATION,
                "http://localhost:5173/login?driveHistory=unavailable&returnTo=%2Fstudent"));
        assertNoLogin();
    }

    @Test
    void browserNonceAndExpiryAreMandatoryAndConsumedEvenOnRejectedCallbacks() throws Exception {
        Started missingNonce = begin("/student");
        mvc.perform(get("/api/drive-history/auth/callback").param("state", missingNonce.state()).param("code", "provider-code"))
            .andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        callback(missingNonce).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        Started wrongNonce = begin("/student");
        Cookie attacker = new Cookie("WILDTRACK_DRIVE_OAUTH", "Z".repeat(43));
        mvc.perform(get("/api/drive-history/auth/callback").param("state", wrongNonce.state())
                .param("code", "provider-code").cookie(attacker))
            .andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        Started expired = begin("/student");
        var saved = loginStates.findById(hash(expired.state())).orElseThrow();
        loginStates.saveAndFlush(new DriveOAuthLoginState(hash(expired.state()), saved.getNonceHash(),
            saved.getReturnPath(), saved.getCodeVerifier(), Instant.now().minusSeconds(60)));
        callback(expired).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertNoLogin();
        verifyNoInteractions(tokens, identities);
    }

    @Test
    void rejectedFullIdentityCannotIssueCookieOrBindRole() throws Exception {
        Started started = begin("/student");
        when(identities.verifiedIdentity(anyString(), anyString())).thenThrow(new IllegalArgumentException("private identity detail"));
        callback(started).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andExpect(header().string(HttpHeaders.LOCATION,
                "http://localhost:5173/login?driveHistory=error&returnTo=%2Fstudent"));
        assertNoLogin();
        verify(staff, never()).onBindLogin(anyString(), anyString());
    }

    @Test
    void selectedCallbackAccountOwnsBothGrantAndSessionAndOldBrowserSessionIsRevoked() throws Exception {
        String oldSubject = "old-login-flow-" + UUID.randomUUID();
        var old = sessions.create(new GoogleIdentity(oldSubject, "old@example.invalid", "Old Account", ""));
        createdTokens.add(old.rawToken());
        Cookie oldCookie = new Cookie("WILDTRACK_SESSION", old.rawToken());
        Started started = begin("/student");
        var completed = mvc.perform(get("/api/drive-history/auth/callback").param("state", started.state())
                .param("code", "provider-code").cookie(started.nonce(), oldCookie))
            .andExpect(status().isSeeOther()).andExpect(cookie().exists("WILDTRACK_SESSION")).andReturn().getResponse();
        Cookie fresh = completed.getCookie("WILDTRACK_SESSION");
        createdTokens.add(fresh.getValue());
        assertThat(sessions.resolve(old.rawToken())).isEmpty();
        assertThat(sessions.resolve(fresh.getValue()).orElseThrow().googleSubject()).isEqualTo(subject);
        assertThat(grants.findById(oldSubject)).isEmpty();
        assertThat(access.connected(subject)).isTrue();
    }

    @Test
    void missingFreshRefreshCanReuseOnlyUsableSavedGrantForVerifiedSelectedAccount() throws Exception {
        grants.saveAndFlush(new DriveOAuthGrant(subject, cipher.encrypt(subject, "saved-refresh"), FULL_SCOPES, Instant.now()));
        Started started = begin("/student");
        when(tokens.exchange(anyString(), anyString())).thenReturn(response(null,
            "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile "
                + DriveOAuthProperties.DRIVE_SCOPE));
        Cookie session = callback(started).andExpect(status().isSeeOther()).andExpect(cookie().exists("WILDTRACK_SESSION"))
            .andReturn().getResponse().getCookie("WILDTRACK_SESSION");
        createdTokens.add(session.getValue());
        assertThat(access.connected(subject)).isTrue();
        assertThat(cipher.decrypt(subject, grants.findById(subject).orElseThrow().getEncryptedRefreshToken()))
            .isEqualTo("saved-refresh");
    }

    @Test
    void otherAccountCorruptAndRevokedSavedGrantsCannotReplaceMissingRefresh() throws Exception {
        String other = "other-login-flow-" + UUID.randomUUID();
        addedGrants.add(other);
        grants.saveAndFlush(new DriveOAuthGrant(other, cipher.encrypt(other, "other-refresh"), FULL_SCOPES, Instant.now()));
        when(tokens.exchange(anyString(), anyString())).thenReturn(response(null, FULL_SCOPES));
        callback(begin("/student")).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertNoLogin();
        grants.saveAndFlush(new DriveOAuthGrant(subject, "v1.corrupt", FULL_SCOPES, Instant.now()));
        callback(begin("/student")).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertThat(sessionRows.count()).isEqualTo(sessionCountBefore);
        var revoked = new DriveOAuthGrant(subject, cipher.encrypt(subject, "old-refresh"), FULL_SCOPES, Instant.now());
        revoked.revoke(Instant.now());
        grants.saveAndFlush(revoked);
        callback(begin("/student")).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertThat(sessionRows.count()).isEqualTo(sessionCountBefore);
    }

    @Test
    void nonpersistableGrantAndDatabaseWriteFailureConsumeStateWithoutIssuingSession() throws Exception {
        Started oversized = begin("/student");
        when(tokens.exchange(anyString(), anyString())).thenReturn(response("R".repeat(2048), FULL_SCOPES));
        callback(oversized).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertNoLogin();
        when(tokens.exchange(anyString(), anyString())).thenReturn(response("refresh-token", FULL_SCOPES));
        Started storageFailure = begin("/student");
        doThrow(new DataIntegrityViolationException("private persistence detail"))
            .when(grants).saveAndFlush(any(DriveOAuthGrant.class));
        callback(storageFailure).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andExpect(header().string(HttpHeaders.LOCATION,
                "http://localhost:5173/login?driveHistory=unavailable&returnTo=%2Fstudent"));
        assertNoLogin();
        callback(storageFailure).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        verify(staff, never()).onBindLogin(anyString(), anyString());
    }

    @Test
    void roleBindingFailureOccursAfterGrantCommitAndCannotIssueSessionOrRestoreState() throws Exception {
        Started started = begin("/student");
        doThrow(new IllegalStateException("private role detail")).when(staff).onBindLogin(anyString(), anyString());
        callback(started).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertThat(loginStates.count()).isZero();
        assertThat(access.connected(subject)).isTrue();
        assertThat(sessionRows.count()).isEqualTo(sessionCountBefore);
        callback(started).andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
    }

    @Test
    void connectStateCannotBeReinterpretedAsAnonymousLoginOrSwitchItsSessionAccount() throws Exception {
        String oldSubject = "connect-login-flow-" + UUID.randomUUID();
        var old = sessions.create(new GoogleIdentity(oldSubject, "old@example.invalid", "Old Account", ""));
        createdTokens.add(old.rawToken());
        Cookie session = new Cookie("WILDTRACK_SESSION", old.rawToken());
        var begun = mvc.perform(get("/api/drive-history/auth/start").param("returnTo", "/student").cookie(session))
            .andExpect(status().isSeeOther()).andReturn().getResponse();
        Started connect = started(begun.getHeader(HttpHeaders.LOCATION), begun.getHeaders(HttpHeaders.SET_COOKIE));
        mvc.perform(get("/api/drive-history/auth/callback").param("state", connect.state())
                .param("code", "provider-code").cookie(connect.nonce(), session))
            .andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));
        assertThat(grants.findById(subject)).isEmpty();
        assertThat(grants.findById(oldSubject)).isEmpty();
        verify(identities, never()).verifiedIdentity(anyString(), anyString());
        assertThat(sessions.resolve(old.rawToken())).isPresent();
    }

    @Test
    void publicLoginStartIsRateLimitedAndInvalidReturnDestinationsAreRejected() throws Exception {
        String client = "192.0.2." + CLIENTS.incrementAndGet();
        for (int attempt = 0; attempt < 5; attempt++) {
            mvc.perform(get("/api/auth/google/start").header("X-Forwarded-For", client)).andExpect(status().isSeeOther());
        }
        mvc.perform(get("/api/auth/google/start").header("X-Forwarded-For", client))
            .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "60"));
        for (String path : java.util.List.of("https://evil.invalid/", "//evil.invalid/", "/student#fragment",
                "/student?x=%0d%0a\r\n", "/student?x=" + "a".repeat(490))) {
            mvc.perform(get("/api/auth/google/start").param("returnTo", path)
                    .header("X-Forwarded-For", "192.0.2." + CLIENTS.incrementAndGet()))
                .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(tokens, identities);
    }

    private Started begin(String returnTo) throws Exception {
        var result = mvc.perform(get("/api/auth/google/start").param("returnTo", returnTo)
                .header("X-Forwarded-For", "192.0.2." + CLIENTS.incrementAndGet()))
            .andExpect(status().isSeeOther()).andExpect(cookie().doesNotExist("WILDTRACK_SESSION"))
            .andReturn().getResponse();
        return started(result.getHeader(HttpHeaders.LOCATION), result.getHeaders(HttpHeaders.SET_COOKIE));
    }

    private Started started(String location, java.util.List<String> cookies) {
        Map<String, String> params = new HashMap<>();
        for (String segment : URI.create(location).getRawQuery().split("&")) {
            String[] pair = segment.split("=", 2);
            params.put(pair[0], URLDecoder.decode(pair[1], StandardCharsets.UTF_8));
        }
        String nonceCookie = cookies.stream().filter(value -> value.startsWith("WILDTRACK_DRIVE_OAUTH="))
            .findFirst().orElseThrow();
        assertThat(nonceCookie).contains("HttpOnly", "SameSite=Lax", "Path=/api/drive-history/auth/callback", "Max-Age=300");
        Cookie nonce = new Cookie("WILDTRACK_DRIVE_OAUTH", nonceCookie.split(";", 2)[0].split("=", 2)[1]);
        return new Started(params.get("state"), nonce, params);
    }

    private org.springframework.test.web.servlet.ResultActions callback(Started started) throws Exception {
        return mvc.perform(get("/api/drive-history/auth/callback").param("state", started.state())
            .param("code", "provider-code").cookie(started.nonce()));
    }

    private void assertNoLogin() {
        assertThat(loginStates.count()).isZero();
        assertThat(sessionRows.count()).isEqualTo(sessionCountBefore);
        assertThat(grants.findById(subject)).isEmpty();
    }

    private GoogleDriveOAuthTokenEndpoint.TokenResponse response(String refresh, String scope) {
        return new GoogleDriveOAuthTokenEndpoint.TokenResponse("temporary-access", refresh, "signed-login-token", scope, 0);
    }

    private static String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private record Started(String state, Cookie nonce, Map<String, String> params) { }
}
