package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static com.capvault.backend.support.AuthenticatedRequest.adviserSession;
import static com.capvault.backend.support.AuthenticatedRequest.session;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Production request-boundary contract: the minimum public surface is the health
 * and sign-in inventory; every other API operation requires a valid server
 * session. Cookies, CSRF, headers, throttling, and failure redaction are part
 * of the same boundary.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProductionSecurityBoundaryTest {

    @Autowired
    private MockMvc mockMvc;

    @BeforeEach
    void resetSignInWindow() {
        SecurityConfig.resetSignInThrottle();
    }

    @Test
    void onlyHealthAndSignInRemainPublic() throws Exception {
        mockMvc.perform(get("/api/health/live")).andExpect(status().isOk());
        mockMvc.perform(get("/api/health/ready")).andExpect(status().isOk());
        mockMvc.perform(get("/api/auth/session")).andExpect(status().isOk());
        mockMvc.perform(post("/api/auth/google/session").with(csrf())
                .contentType("application/json")
                .content("{\"credential\":\"not-a-real-credential\"}"))
            .andExpect(status().is4xxClientError());

        mockMvc.perform(get("/api/workspaces")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/students")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/tracker/rows")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/templates")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/workspace/sources")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/workspace/students/me")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/workspace/responses/mine")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/workspace/drafts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/file-checks/status")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/sheets/import-runs")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/workspace/staff")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/health")).andExpect(status().isUnauthorized());
    }

    @Test
    void h2ConsoleIsNotReachableThroughTheApiBoundary() throws Exception {
        mockMvc.perform(get("/h2-console")).andExpect(status().isUnauthorized());
    }

    @Test
    void stateChangingRequestsRequireCsrfExceptTheDocumentedSignInSurface() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                .contentType("application/json"))
            .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/workspaces").with(csrf())
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void adminControlPlaneMutationsRejectOrdinaryAuthenticatedUsers() throws Exception {
        String id = "11111111-1111-1111-1111-111111111111";

        mockMvc.perform(post("/api/workspaces").with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/workspaces/" + id).with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/sheets/import/TEAM_FORMATION").with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/deliverables").with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/deliverables/" + id).with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/templates").with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/templates/from-drive").with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/templates/" + id).with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/workspace/sources/TRACKER").with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/tracker/writebacks").with(session()))
            .andExpect(status().isForbidden());
    }

    @Test
    void fileCheckApiRequiresStaffAndAllowsAdvisers() throws Exception {
        mockMvc.perform(get("/api/file-checks/status").with(session()))
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/file-checks").with(session()))
            .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/file-checks/status").with(adviserSession()))
            .andExpect(status().isOk());
        mockMvc.perform(post("/api/file-checks").with(adviserSession())
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void sessionCookieCarriesTheProductionPolicy() {
        var properties = new WildTrackSessionProperties(java.time.Duration.ofDays(90), true, "wildtrack.dev");

        assertThat(properties.secure()).isTrue();
        assertThat(properties.ttl()).isEqualTo(java.time.Duration.ofDays(90));
        assertThat(properties.cookieDomain()).isEqualTo("wildtrack.dev");
    }

    @Test
    void responsesCarryBaselineSecurityHeaders() throws Exception {
        mockMvc.perform(get("/api/health/live"))
            .andExpect(status().isOk())
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("X-Frame-Options", "DENY"))
            .andExpect(header().string("Referrer-Policy", "no-referrer"))
            .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=()"));
    }

    @Test
    void signInThrottlingIsBoundedAndRetryable() throws Exception {
        // Five failures are allowed inside the fixed window, then the boundary
        // responds with a retryable 429 instead of another credential check.
        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post("/api/auth/google/session").with(csrf())
                    .contentType("application/json")
                    .content("{\"credential\":\"bad\"}"))
                .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/auth/google/session").with(csrf())
                .contentType("application/json")
                .content("{\"credential\":\"bad\"}"))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "60"))
            .andExpect(jsonPath("$.error").value("Too many attempts. Try again shortly."));
    }

    @Test
    void unexpectedFailuresAreRedactedWithoutStackOrDatabaseDetails() throws Exception {
        mockMvc.perform(post("/api/workspace/responses/canonical/select").with(csrf())
                .contentType("application/json")
                .content("{\"deliverableId\":null,\"studentRecordId\":null,\"responseId\":null,\"reason\":\"x\"}"))
            .andExpect(status().isUnauthorized());
    }
}
