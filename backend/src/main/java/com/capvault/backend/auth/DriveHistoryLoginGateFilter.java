package com.capvault.backend.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Enforces completed sign-in even on application routes whose Spring authorization is permitAll. */
public class DriveHistoryLoginGateFilter extends OncePerRequestFilter {
    private static final Set<String> RECOVERY_GET_PATHS = Set.of(
        "/api/auth/session", "/api/auth/google/start", "/api/drive-history/auth/start", "/api/drive-history/auth/status",
        "/api/drive-history/auth/callback", "/api/health/live", "/api/health/ready");
    private static final Set<String> RECOVERY_POST_PATHS = Set.of(
        "/api/auth/google/session", "/api/auth/logout", "/api/drive-history/auth/disconnect");
    private static final String REQUIRED_RESPONSE =
        "{\"status\":403,\"code\":\"DRIVE_HISTORY_REQUIRED\",\"message\":\"Connect Google Drive history to finish signing in.\"}";

    private final DriveHistoryLoginPolicy policy;

    public DriveHistoryLoginGateFilter(DriveHistoryLoginPolicy policy) { this.policy = policy; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!policy.required() || !path.startsWith("/api/") || recoveryRequest(request.getMethod(), path)) {
            chain.doFilter(request, response);
            return;
        }

        // Reuse the same first cookie/session accepted by authentication, including duplicate-cookie behavior.
        Object resolved = request.getAttribute(WildTrackSessionAuthenticationFilter.RESOLVED_SESSION_ATTRIBUTE);
        StoredWildTrackSession session = resolved instanceof StoredWildTrackSession value ? value : null;
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean authenticated = authentication != null && authentication.isAuthenticated()
            && !(authentication instanceof AnonymousAuthenticationToken);
        boolean publicFormMutation = publicFormPath(path) && !"GET".equals(request.getMethod());
        if (session == null && !authenticated && !publicFormMutation) {
            chain.doFilter(request, response);
            return;
        }
        if (session != null && policy.status(session.googleSubject()).connected()) {
            chain.doFilter(request, response);
            return;
        }

        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write(REQUIRED_RESPONSE);
    }

    private static boolean recoveryRequest(String method, String path) {
        if ("GET".equals(method)) {
            return RECOVERY_GET_PATHS.contains(path) || publicFormPath(path);
        }
        return "POST".equals(method) && RECOVERY_POST_PATHS.contains(path);
    }

    private static boolean publicFormPath(String path) {
        return path.equals("/api/public/forms") || path.startsWith("/api/public/forms/");
    }
}
