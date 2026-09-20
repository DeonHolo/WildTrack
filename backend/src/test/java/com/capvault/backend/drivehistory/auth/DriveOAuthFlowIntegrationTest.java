package com.capvault.backend.drivehistory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {
    "wildtrack.drive-history.oauth.enabled=true",
    "wildtrack.drive-history.oauth.client-id=mock-web-client",
    "wildtrack.drive-history.oauth.client-secret=mock-secret",
    "wildtrack.drive-history.oauth.redirect-uri=http://localhost:8080/api/drive-history/auth/callback",
    "wildtrack.drive-history.oauth.frontend-origin=http://localhost:5173",
    "wildtrack.drive-history.oauth.encryption-key-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DriveOAuthFlowIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;
    @Autowired DriveOAuthGrantRepository grants;
    @Autowired DriveOAuthPendingStateRepository pending;
    @Autowired DelegatedDriveAccessService access;
    @Autowired DriveRefreshTokenCipher cipher;
    @MockBean GoogleDriveOAuthTokenEndpoint tokens;
    @MockBean DriveOAuthIdentityVerifier identities;

    @BeforeEach
    void configureTokenResult() {
        when(tokens.exchange(anyString(), anyString())).thenReturn(
            new GoogleDriveOAuthTokenEndpoint.TokenResponse(
                "temporary-access", "long-lived-refresh", "signed-callback-identity",
                "openid email " + DriveOAuthProperties.DRIVE_SCOPE, 0));
        when(identities.verifiedSubject("signed-callback-identity")).thenReturn("subject-one");
    }

    @Test
    void callbackBindsGoogleIdTokenSubjectStoresOnlyCiphertextAndCannotReplay() throws Exception {
        Cookie session = cookie("subject-one");
        Started started = begin(session, "/student");
        assertThat(started.location()).contains("accounts.google.com/o/oauth2/v2/auth")
            .contains("openid").contains("drive.metadata.readonly")
            .contains("access_type=offline").contains("code_challenge=");
        assertThat(started.nonce().isHttpOnly()).isTrue();

        var success = mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", started.state()).param("code", "provider-code")
                .cookie(session, started.nonce()))
            .andExpect(status().isSeeOther()).andReturn().getResponse();
        assertThat(success.getHeader(HttpHeaders.LOCATION))
            .isEqualTo("http://localhost:5173/student?driveHistory=connected");
        assertThat(success.getHeaders(HttpHeaders.SET_COOKIE).stream()
            .filter(value -> value.startsWith("WILDTRACK_DRIVE_OAUTH=")).findFirst().orElseThrow())
            .contains("Max-Age=0");

        DriveOAuthGrant grant = grants.findById("subject-one").orElseThrow();
        assertThat(grant.connected()).isTrue();
        assertThat(grant.getEncryptedRefreshToken()).startsWith("v1.").doesNotContain("long-lived-refresh");
        assertThat(cipher.decrypt("subject-one", grant.getEncryptedRefreshToken()))
            .isEqualTo("long-lived-refresh");
        assertThat(pending.count()).isZero();

        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", started.state()).param("code", "provider-code")
                .cookie(session, started.nonce()))
            .andExpect(status().isSeeOther());
        verify(tokens).exchange(org.mockito.ArgumentMatchers.eq("provider-code"), anyString());
        mvc.perform(get("/api/drive-history/auth/status").cookie(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.configured").value(true))
            .andExpect(jsonPath("$.connected").value(true));
        mvc.perform(post("/api/drive-history/auth/disconnect").cookie(session).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.connected").value(false));
        assertThat(grants.findById("subject-one").orElseThrow().getEncryptedRefreshToken()).isNull();
    }

    @Test
    void callbackRejectsDifferentSessionAndDifferentGoogleIdentity() throws Exception {
        Cookie owner = cookie("subject-one");
        Started stolen = begin(owner, "/student");
        Cookie attacker = cookie("subject-two");
        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", stolen.state()).param("code", "provider-code")
                .cookie(attacker, stolen.nonce()))
            .andExpect(status().isSeeOther());
        assertThat(grants.findById("subject-one")).isEmpty();
        verify(tokens, never()).exchange(anyString(), anyString());

        Started mismatch = begin(owner, "/student");
        when(identities.verifiedSubject("signed-callback-identity")).thenReturn("different-google-subject");
        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", mismatch.state()).param("code", "provider-code")
                .cookie(owner, mismatch.nonce()))
            .andExpect(status().isSeeOther())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string(
                HttpHeaders.LOCATION, "http://localhost:5173/student?driveHistory=error"));
        assertThat(grants.findById("subject-one")).isEmpty();
    }

    @Test
    void declinedAndMissingScopeRemainDisconnectedWhileNormalSessionSurvives() throws Exception {
        Cookie session = cookie("subject-one");
        Started denied = begin(session, "/");
        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", denied.state()).param("error", "access_denied")
                .cookie(session, denied.nonce()))
            .andExpect(status().isSeeOther())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string(
                HttpHeaders.LOCATION, "http://localhost:5173/?driveHistory=declined"));
        verify(tokens, never()).exchange(anyString(), anyString());
        Started limited = begin(session, "/student");
        when(tokens.exchange(anyString(), anyString())).thenReturn(
            new GoogleDriveOAuthTokenEndpoint.TokenResponse(
                "access", "refresh", "signed-callback-identity", "openid email", 3600));
        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", limited.state()).param("code", "provider-code")
                .cookie(session, limited.nonce()))
            .andExpect(status().isSeeOther())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string(
                HttpHeaders.LOCATION, "http://localhost:5173/student?driveHistory=declined"));
        mvc.perform(get("/api/drive-history/auth/status").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.connected").value(false));
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true));
    }

    @Test
    void rejectsOpenRedirectAndMissingNonceWithoutTokenExchange() throws Exception {
        Cookie session = cookie("subject-one");
        mvc.perform(get("/api/drive-history/auth/start")
                .param("returnTo", "//evil.example/path").cookie(session))
            .andExpect(status().isBadRequest());
        Started started = begin(session, "/student");
        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", started.state()).param("code", "provider-code")
                .cookie(session))
            .andExpect(status().isSeeOther())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string(
                HttpHeaders.LOCATION, "http://localhost:5173/?driveHistory=error"));
        verify(tokens, never()).exchange(anyString(), anyString());
    }

    @Test
    void preservesSafeWorkspaceQueryOnOAuthReturnButRejectsExternalAndFragmentPaths() throws Exception {
        Cookie session = cookie("subject-one");
        Started started = begin(session, "/adviser?workspaceId=abc-123&team=TEAM-A");
        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", started.state()).param("code", "provider-code")
                .cookie(session, started.nonce()))
            .andExpect(status().isSeeOther())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string(
                HttpHeaders.LOCATION,
                "http://localhost:5173/adviser?workspaceId=abc-123&team=TEAM-A&driveHistory=connected"));
        for (String malicious : java.util.List.of("https://evil.example/", "//evil.example/",
                "/student#evil", "/student\\\\evil", "/student?x=%0d%0a\\r\\nInjected")) {
            mvc.perform(get("/api/drive-history/auth/start")
                    .param("returnTo", malicious).cookie(session))
                .andExpect(status().isBadRequest());
        }
    }

    @Test
    void invalidGrantRevokesStoredRefreshTokenWithoutLoggingOrAffectingLogin() throws Exception {
        Cookie session = cookie("subject-one");
        Started started = begin(session, "/");
        mvc.perform(get("/api/drive-history/auth/callback")
                .param("state", started.state()).param("code", "provider-code")
                .cookie(session, started.nonce())).andExpect(status().isSeeOther());
        when(tokens.refresh("long-lived-refresh"))
            .thenThrow(new GoogleDriveOAuthTokenEndpoint.DriveOAuthTokenException(true));
        assertThat(access.accessTokenForSubject("subject-one")).isEmpty();
        var revoked = grants.findById("subject-one").orElseThrow();
        assertThat(revoked.getEncryptedRefreshToken()).isNull();
        assertThat(revoked.getRevokedAt()).isNotNull();
        mvc.perform(get("/api/auth/session").cookie(session))
            .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(true));
    }

    private Cookie cookie(String subject) {
        var created = sessions.create(new GoogleIdentity(subject, subject + "@example.com", subject, null));
        return new Cookie("WILDTRACK_SESSION", created.rawToken());
    }

    private Started begin(Cookie session, String returnTo) throws Exception {
        var result = mvc.perform(get("/api/drive-history/auth/start")
                .param("returnTo", returnTo).cookie(session))
            .andExpect(status().isSeeOther()).andReturn().getResponse();
        String location = result.getHeader(HttpHeaders.LOCATION);
        String state = Arrays.stream(URI.create(location).getRawQuery().split("&"))
            .filter(segment -> segment.startsWith("state="))
            .map(segment -> URLDecoder.decode(segment.substring("state=".length()), StandardCharsets.UTF_8))
            .findFirst().orElseThrow();
        String rawCookie = result.getHeaders(HttpHeaders.SET_COOKIE).stream()
            .filter(value -> value.startsWith("WILDTRACK_DRIVE_OAUTH=")).findFirst().orElseThrow();
        assertThat(rawCookie).contains("HttpOnly").contains("SameSite=Lax");
        String nonce = rawCookie.split(";", 2)[0].split("=", 2)[1];
        Cookie stateCookie = new Cookie("WILDTRACK_DRIVE_OAUTH", nonce);
        stateCookie.setHttpOnly(true);
        return new Started(location, state, stateCookie);
    }

    private record Started(String location, String state, Cookie nonce) { }
}
