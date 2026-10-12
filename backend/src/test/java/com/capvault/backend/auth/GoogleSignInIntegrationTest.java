package com.capvault.backend.auth;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Uses the real session/security boundary with Google credential verification mocked. */
@SpringBootTest(properties = {
    // A host may retain these obsolete variables after deployment; they must have no effect.
    "wildtrack.drive-history.required-for-login=true",
    "wildtrack.drive-history.oauth.enabled=true"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GoogleSignInIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;
    @MockBean GoogleIdentityService identities;

    @Test
    void ordinaryGoogleSignInCreatesAUsableSessionDespiteRetiredConfiguration() throws Exception {
        GoogleIdentity identity = identity();
        when(identities.authenticate("ordinary-google-credential")).thenReturn(identity);
        var result = mvc.perform(post("/api/auth/google/session")
                .contentType("application/json")
                .content("{\"credential\":\"ordinary-google-credential\"}"))
            .andExpect(status().isOk())
            .andExpect(cookie().exists("WILDTRACK_SESSION"))
            .andExpect(cookie().httpOnly("WILDTRACK_SESSION", true))
            .andExpect(cookie().doesNotExist("WILDTRACK_DRIVE_OAUTH"))
            .andExpect(header().doesNotExist("Location"))
            .andExpect(jsonPath("$.subject").value(identity.subject()))
            .andReturn();
        Cookie session = result.getResponse().getCookie("WILDTRACK_SESSION");
        try {
            mvc.perform(get("/api/auth/session").cookie(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.googleSubject").value(identity.subject()))
                .andExpect(jsonPath("$.driveHistoryRequired").doesNotExist())
                .andExpect(jsonPath("$.driveHistoryConnected").doesNotExist())
                .andExpect(jsonPath("$.driveHistoryConfigured").doesNotExist());
            mvc.perform(get("/api/workspaces").cookie(session)).andExpect(status().isOk());
            mvc.perform(get("/api/workspaces")).andExpect(status().isUnauthorized());
            mvc.perform(post("/api/workspaces").cookie(session).with(csrf())
                    .contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
            mvc.perform(post("/api/auth/logout").cookie(session).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(cookie().maxAge("WILDTRACK_SESSION", 0));
            mvc.perform(get("/api/auth/session").cookie(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.authenticated").value(false));
        } finally {
            sessions.revoke(session.getValue());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "/api/auth/google/start",
        "/api/drive-history/auth/start",
        "/api/drive-history/auth/status",
        "/api/drive-history/auth/callback",
        "/api/drive-history"
    })
    void retiredConsentAndRevisionRoutesCannotStartOrUseGoogleAuthorization(String path) throws Exception {
        mvc.perform(get(path))
            .andExpect(status().isUnauthorized())
            .andExpect(header().doesNotExist("Location"))
            .andExpect(cookie().doesNotExist("WILDTRACK_DRIVE_OAUTH"));
        var created = sessions.create(identity());
        Cookie session = new Cookie("WILDTRACK_SESSION", created.rawToken());
        try {
            mvc.perform(get(path).cookie(session))
                .andExpect(status().isNotFound())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(cookie().doesNotExist("WILDTRACK_DRIVE_OAUTH"));
        } finally {
            sessions.revoke(created.rawToken());
        }
    }

    @Test
    void retiredDisconnectRouteCannotMutateStoredGrants() throws Exception {
        var created = sessions.create(identity());
        try {
            mvc.perform(post("/api/drive-history/auth/disconnect")
                    .cookie(new Cookie("WILDTRACK_SESSION", created.rawToken())).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(header().doesNotExist("Location"));
        } finally {
            sessions.revoke(created.rawToken());
        }
    }

    private static GoogleIdentity identity() {
        return new GoogleIdentity("ordinary-sign-in-" + UUID.randomUUID(),
            "ordinary-student@example.invalid", "Student", "");
    }
}
