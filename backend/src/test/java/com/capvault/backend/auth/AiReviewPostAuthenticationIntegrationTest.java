package com.capvault.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.Instant;
import java.util.UUID;

import com.capvault.backend.aireview.AiReviewService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Reproduces the browser's session GET and protected AI POST without Google, Drive, or Gemini calls. */
@SpringBootTest(properties = "capvault.cors.allowed-origins=https://www.wildtrack.dev")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiReviewPostAuthenticationIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired WildTrackSessionService sessions;
    @Autowired StaffRoleAssignmentRepository staffRoles;
    @MockBean AiReviewService aiReviewService;

    @Test void csrfPrecheckDoesNotReplaceAdministratorSessionForAiReviewPost() throws Exception {
        String subject = "ai-review-post-" + UUID.randomUUID();
        String email = "admin@example.invalid";
        var session = sessions.create(new GoogleIdentity(subject, email, "Administrator", ""));
        var assignment = staffRoles.save(new StaffRoleAssignment(UUID.randomUUID(), subject, email,
            StaffRole.ADMIN, true, Instant.now(), Instant.now()));
        UUID responseId = UUID.randomUUID();
        UUID workspaceId = UUID.randomUUID();
        Cookie sessionCookie = new Cookie(WildTrackSessionController.SESSION_COOKIE, session.rawToken());
        try {
            var sessionResponse = mvc.perform(get("/api/auth/session").cookie(sessionCookie)
                    .header("Host", "www.wildtrack.dev")
                    .header("X-Forwarded-Host", "www.wildtrack.dev")
                    .header("X-Forwarded-Proto", "https"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.roles[0]").value("ADMIN"))
                .andReturn().getResponse();
            Cookie csrfCookie = sessionResponse.getCookie("XSRF-TOKEN");
            assertThat(csrfCookie).as("Browser's session precheck must set the CSRF cookie").isNotNull();
            assertThat(csrfCookie.getValue()).isNotBlank();
            // A subsequent CSRF precheck on the same browser origin must neither
            // issue a replacement WildTrack identity cookie nor revoke this one.
            mvc.perform(get("/api/auth/session")
                    .cookie(sessionCookie, new Cookie("XSRF-TOKEN", csrfCookie.getValue())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.roles[0]").value("ADMIN"))
                .andExpect(cookie().doesNotExist("WILDTRACK_SESSION"));

            when(aiReviewService.review(eq(workspaceId), eq(responseId), isNull(), eq(subject),
                eq(false), isNull(), eq(false))).thenReturn(new AiReviewService.View(
                "RUNNING", false, "Review queued.", null, null, null, true, null, null,
                null, null, null, null));
            mvc.perform(post("/api/ai-reviews/{responseId}", responseId)
                    .queryParam("workspaceId", workspaceId.toString())
                    .cookie(sessionCookie, new Cookie("XSRF-TOKEN", csrfCookie.getValue()))
                    .header("X-XSRF-TOKEN", csrfCookie.getValue())
                    .header("Host", "www.wildtrack.dev")
                    .header("X-Forwarded-Host", "www.wildtrack.dev")
                    .header("X-Forwarded-Proto", "https")
                    .header("Origin", "https://www.wildtrack.dev")
                    .accept(MediaType.APPLICATION_JSON)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"fieldId\":null,\"retryAcknowledged\":false,\"retryToken\":null,\"rerunRequested\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(header().doesNotExist("X-WildTrack-Session-State"));
            verify(aiReviewService).review(eq(workspaceId), eq(responseId), isNull(), eq(subject),
                eq(false), isNull(), eq(false));
        } finally {
            sessions.revoke(session.rawToken());
            staffRoles.deleteById(assignment.getId());
        }
    }
}
