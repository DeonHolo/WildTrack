package com.capvault.backend.support;

import jakarta.servlet.http.Cookie;

import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Provides an authenticated request for controller tests: the security chain
 * sees a real authenticated principal and CSRF token, and controllers resolve
 * the same test session through the WILDTRACK_SESSION cookie.
 */
public final class AuthenticatedRequest {

    public static final String TEST_SUBJECT = "test-subject";
    public static final String TEST_EMAIL = "test.student@gmail.com";
    public static final String TEST_SESSION_TOKEN = "test-session-token";

    private AuthenticatedRequest() {
    }

    public static RequestPostProcessor session() {
        Authentication authentication = new TestingAuthenticationToken(
            "wildtrack-test-principal", "n/a", "ROLE_USER");
        RequestPostProcessor authenticated = SecurityMockMvcRequestPostProcessors.authentication(authentication);
        RequestPostProcessor csrf = SecurityMockMvcRequestPostProcessors.csrf();

        return request -> {
            MockHttpServletRequest processed = csrf.postProcessRequest(request);
            processed = authenticated.postProcessRequest(processed);
            processed.setCookies(new Cookie("WILDTRACK_SESSION", TEST_SESSION_TOKEN));
            return processed;
        };
    }
}
