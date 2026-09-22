package com.capvault.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;

import com.capvault.backend.staff.StaffAccessResolver;
import com.capvault.backend.staff.StaffRole;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

class WildTrackSessionAuthenticationFilterTest {

    private WildTrackSessionService sessionService;
    private StaffAccessResolver staffAccessResolver;
    private WildTrackSessionAuthenticationFilter filter;

    @BeforeEach
    void setUp() {
        sessionService = mock(WildTrackSessionService.class);
        staffAccessResolver = mock(StaffAccessResolver.class);
        filter = new WildTrackSessionAuthenticationFilter(sessionService, staffAccessResolver);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void populatesSecurityContextWhenSessionCookieIsValid() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(WildTrackSessionController.SESSION_COOKIE, "valid-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        StoredWildTrackSession session = new StoredWildTrackSession(
            "hash",
            "subject-123",
            "instructor@cit.edu.ph",
            Instant.now(),
            Instant.now().plusSeconds(3600)
        );
        when(sessionService.resolve("valid-token")).thenReturn(Optional.of(session));
        when(staffAccessResolver.activeRolesFor("subject-123")).thenReturn(Set.of(StaffRole.ADVISER));

        filter.doFilterInternal(request, response, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getName()).isEqualTo("instructor@cit.edu.ph");
        assertThat(auth.getAuthorities()).extracting("authority")
            .containsExactlyInAnyOrder("ROLE_USER", "ROLE_ADVISER");
        assertThat(request.getAttribute(WildTrackSessionAuthenticationFilter.SESSION_STATE_ATTRIBUTE))
            .isEqualTo("authenticated");
        verify(chain).doFilter(request, response);
    }

    @Test
    void leavesSecurityContextEmptyWhenNoSessionCookie() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilterInternal(request, response, chain);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNull();
        assertThat(request.getAttribute(WildTrackSessionAuthenticationFilter.SESSION_STATE_ATTRIBUTE))
            .isEqualTo("missing_cookie");
        verify(chain).doFilter(request, response);
    }

    @Test
    void recordsRejectedCookieWithoutExposingTokenValueOrAuthenticating() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(WildTrackSessionController.SESSION_COOKIE, "secret-invalid-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        when(sessionService.resolve("secret-invalid-token")).thenReturn(Optional.empty());

        filter.doFilterInternal(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(request.getAttribute(WildTrackSessionAuthenticationFilter.SESSION_STATE_ATTRIBUTE))
            .isEqualTo("invalid_session");
        assertThat(response.getHeader("X-WildTrack-Session-State")).isNull();
        verify(chain).doFilter(request, response);
    }

    @Test
    void flagsDuplicateSessionCookiesWithoutLoggingTheirValuesOrSelectingAnotherIdentity() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(WildTrackSessionController.SESSION_COOKIE, "stale-token"),
            new Cookie(WildTrackSessionController.SESSION_COOKIE, "new-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);
        when(sessionService.resolve("stale-token")).thenReturn(Optional.empty());

        filter.doFilterInternal(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        assertThat(request.getAttribute(WildTrackSessionAuthenticationFilter.SESSION_STATE_ATTRIBUTE))
            .isEqualTo("duplicate_cookie");
        org.mockito.Mockito.verify(sessionService).resolve("stale-token");
        org.mockito.Mockito.verify(sessionService, org.mockito.Mockito.never()).resolve("new-token");
    }
}
