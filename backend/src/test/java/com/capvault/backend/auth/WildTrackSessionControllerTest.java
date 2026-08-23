package com.capvault.backend.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.capvault.backend.config.ApiExceptionHandler;
import com.capvault.backend.config.TimeConfig;
import com.capvault.backend.staff.StaffAccessResolver;
import com.capvault.backend.config.WildTrackSessionProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(WildTrackSessionController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import({ApiExceptionHandler.class, TimeConfig.class})
class WildTrackSessionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private GoogleIdentityService googleIdentityService;

    @MockBean
    private WildTrackSessionService sessionService;

    @MockBean
    private WildTrackSessionProperties properties;

    @MockBean
    private StaffAccessResolver staffAccessResolver;

    private static final Instant NOW = Instant.parse("2026-08-24T00:00:00Z");
    private static final Instant EXPIRY = Instant.parse("2026-08-24T12:00:00Z");
    private static final String RAW_TOKEN = "raw-session-token-value";

    @Test
    void signInCreatesCookieAndReturnsIdentity() throws Exception {
        when(googleIdentityService.authenticate("cred-123")).thenReturn(new GoogleIdentity(
            "google-subject-123", "student@gmail.com", "Student Name", ""));
        when(properties.ttl()).thenReturn(Duration.ofHours(12));
        when(sessionService.create(any(GoogleIdentity.class)))
            .thenReturn(new WildTrackSession(RAW_TOKEN, "a".repeat(64)));

        mockMvc.perform(post("/api/auth/google/session")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"credential\":\"cred-123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.subject").value("google-subject-123"))
            .andExpect(jsonPath("$.email").value("student@gmail.com"))
            .andExpect(cookie().exists("WILDTRACK_SESSION"))
            .andExpect(cookie().httpOnly("WILDTRACK_SESSION", true))
            .andExpect(cookie().maxAge("WILDTRACK_SESSION", 12 * 3600));
    }

    @Test
    void signInWithInvalidCredentialReturns401() throws Exception {
        when(googleIdentityService.authenticate("bad")).thenThrow(new InvalidGoogleCredentialException("no"));

        mockMvc.perform(post("/api/auth/google/session")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"credential\":\"bad\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void sessionLookupReturnsAuthenticatedIdentityWithoutInternalSecrets() throws Exception {
        when(sessionService.resolve(RAW_TOKEN)).thenReturn(
            Optional.of(new StoredWildTrackSession("hash", "google-subject-123", "student@gmail.com", NOW, EXPIRY)));

        mockMvc.perform(get("/api/auth/session")
                .cookie(new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", RAW_TOKEN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.authenticated").value(true))
            .andExpect(jsonPath("$.email").value("student@gmail.com"))
            .andExpect(jsonPath("$.expiresAt").exists())
            .andExpect(jsonPath("$.tokenHash").doesNotExist())
            .andExpect(jsonPath("$.googleSubject").doesNotExist());
    }

    @Test
    void expiredOrUnknownSessionIsAnonymous() throws Exception {
        when(sessionService.resolve(anyString())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/auth/session")
                .cookie(new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", RAW_TOKEN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.authenticated").value(false));
    }

    @Test
    void sessionLookupWithoutCookieIsAnonymous() throws Exception {
        mockMvc.perform(get("/api/auth/session"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.authenticated").value(false));
    }

    @Test
    void logoutRevokesAndClearsCookie() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                .cookie(new jakarta.servlet.http.Cookie("WILDTRACK_SESSION", RAW_TOKEN)))
            .andExpect(status().isOk())
            .andExpect(cookie().maxAge("WILDTRACK_SESSION", 0));

        verify(sessionService).revoke(RAW_TOKEN);
    }
}
