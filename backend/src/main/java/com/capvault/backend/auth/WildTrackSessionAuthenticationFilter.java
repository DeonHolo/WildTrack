package com.capvault.backend.auth;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import com.capvault.backend.staff.StaffAccessResolver;
import com.capvault.backend.staff.StaffRole;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class WildTrackSessionAuthenticationFilter extends OncePerRequestFilter {

    private final WildTrackSessionService sessionService;
    private final StaffAccessResolver staffAccessResolver;

    public WildTrackSessionAuthenticationFilter(
        WildTrackSessionService sessionService,
        StaffAccessResolver staffAccessResolver
    ) {
        this.sessionService = sessionService;
        this.staffAccessResolver = staffAccessResolver;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String token = resolveToken(request);
        if (token != null && !token.isBlank()) {
            Optional<StoredWildTrackSession> sessionOpt = sessionService.resolve(token);
            if (sessionOpt.isPresent()) {
                StoredWildTrackSession session = sessionOpt.get();
                List<GrantedAuthority> authorities = new ArrayList<>();
                authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
                for (StaffRole role : staffAccessResolver.activeRolesFor(session.googleSubject())) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_" + role.name()));
                }
                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    session.googleEmail(),
                    null,
                    authorities
                );
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }
        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (WildTrackSessionController.SESSION_COOKIE.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
