package com.capvault.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.UUID;

import com.capvault.backend.auth.GoogleIdentity;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.StaffRole;
import com.capvault.backend.staff.StaffRoleAssignment;
import com.capvault.backend.staff.StaffRoleAssignmentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

/** An embedded Tomcat test is essential: MockMvc does not reproduce container ERROR redispatch. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class AiReviewCsrfErrorDispatchIntegrationTest {
    @LocalServerPort int port;
    @Autowired WildTrackSessionService sessions;
    @Autowired StaffRoleAssignmentRepository assignments;

    @Autowired TestRestTemplate http;

    @Test void invalidCsrfRemains403WithoutMaskingTrue401OrExposingDirectErrorRoute() throws Exception {
        String origin = "http://localhost:" + port;
        var sessionResult = http.getForEntity(origin + "/api/auth/session", String.class);
        assertThat(sessionResult.getStatusCode().value()).isEqualTo(200);
        String xsrfCookie = sessionResult.getHeaders().getOrEmpty(HttpHeaders.SET_COOKIE).stream()
            .filter(value -> value.startsWith("XSRF-TOKEN="))
            .findFirst().orElseThrow().split(";", 2)[0];
        String xsrfToken = xsrfCookie.substring("XSRF-TOKEN=".length());
        assertThat(xsrfToken).isNotBlank();

        String subject = "csrf-integration-" + UUID.randomUUID();
        var session = sessions.create(new GoogleIdentity(subject, "csrf-test@example.invalid", "Test", ""));
        var role = assignments.save(new StaffRoleAssignment(UUID.randomUUID(), subject,
            "csrf-test@example.invalid", StaffRole.ADMIN, true, Instant.now(), Instant.now()));
        String aiPath = origin + "/api/ai-reviews/not-a-uuid?workspaceId=11111111-1111-1111-1111-111111111111";
        String sessionCookie = "WILDTRACK_SESSION=" + session.rawToken();
        try {
            assertCsrf403(post(aiPath, sessionCookie, null, null));
            // A present CSRF header is NOT enough: the browser must send the
            // same server-issued XSRF-TOKEN cookie on this exact POST.
            assertCsrf403(post(aiPath, sessionCookie, null, xsrfToken));
            assertCsrf403(post(aiPath, sessionCookie, xsrfCookie, "wrong-test-token"));

            // Matching CSRF cookie/header and a valid ADMIN session reach MVC
            // (invalid UUID deliberately avoids any Drive/Gemini work).
            var authorized = post(aiPath, sessionCookie, xsrfCookie, xsrfToken);
            assertThat(authorized.getStatusCode().value()).isEqualTo(400);
            assertThat(authorized.getHeaders().containsKey("X-WildTrack-Session-State")).isFalse();

            // The fix must not turn an unknown session into authorization.
            // HttpURLConnection behind TestRestTemplate can interpret an empty
            // 401 as a retryable authentication challenge for streaming POSTs.
            // JDK HttpClient gives us the raw final 401 without retrying.
            var unknownRequest = HttpRequest.newBuilder(URI.create(aiPath))
                .header("Content-Type", "application/json")
                .header("Cookie", "WILDTRACK_SESSION=unknown-safe-test-session; " + xsrfCookie)
                .header("X-XSRF-TOKEN", xsrfToken)
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build();
            var unknown = HttpClient.newHttpClient().send(unknownRequest, HttpResponse.BodyHandlers.ofString());
            assertThat(unknown.statusCode()).isEqualTo(401);
            assertThat(unknown.headers().firstValue("X-WildTrack-Session-State"))
                .contains("invalid_session");

            // Only ERROR-dispatched /error is allowed; no public URL is opened.
            assertThat(http.getForEntity(origin + "/error", String.class).getStatusCode().value()).isEqualTo(401);
            assertThat(http.getForEntity(origin + "/api/ai-reviews/status", String.class)
                .getStatusCode().value()).isEqualTo(401);
        } finally {
            sessions.revoke(session.rawToken());
            assignments.deleteById(role.getId());
        }
    }

    private ResponseEntity<String> post(String url, String sessionCookie, String xsrfCookie, String xsrfHeader) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.add(HttpHeaders.COOKIE, sessionCookie + (xsrfCookie == null ? "" : "; " + xsrfCookie));
        if (xsrfHeader != null) headers.add("X-XSRF-TOKEN", xsrfHeader);
        return http.exchange(URI.create(url), HttpMethod.POST, new HttpEntity<>("{}", headers), String.class);
    }

    private static void assertCsrf403(ResponseEntity<String> response) {
        assertThat(response.getStatusCode().value()).isEqualTo(403);
        assertThat(response.getHeaders().containsKey("X-WildTrack-Session-State")).isFalse();
    }
}
