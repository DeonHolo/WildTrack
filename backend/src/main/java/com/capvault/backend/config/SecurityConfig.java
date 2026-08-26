package com.capvault.backend.config;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.capvault.backend.auth.WildTrackSessionAuthenticationFilter;
import com.capvault.backend.auth.WildTrackSessionService;
import com.capvault.backend.staff.StaffAccessResolver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class SecurityConfig {

    private static final String SIGN_IN_PATH = "/api/auth/google/session";
    private static final Map<String, Window> SIGN_IN_WINDOWS = new ConcurrentHashMap<>();

    @Bean
    SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        WildTrackSessionService sessionService,
        StaffAccessResolver staffAccessResolver
    ) throws Exception {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);
        WildTrackSessionAuthenticationFilter sessionFilter = new WildTrackSessionAuthenticationFilter(sessionService, staffAccessResolver);

        return http
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(csrfHandler)
                .ignoringRequestMatchers(SIGN_IN_PATH))
            .cors(Customizer.withDefaults())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/health/live", "/api/health/ready", "/api/auth/session", SIGN_IN_PATH, "/api/public/forms/**").permitAll()
                .requestMatchers("/api/**").authenticated()
                .anyRequest().denyAll())
            .exceptionHandling(exceptions -> exceptions
                .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .headers(headers -> headers
                .frameOptions(frame -> frame.deny())
                .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .permissionsPolicy(permissions -> permissions.policy("camera=(), microphone=(), geolocation=()")))
            .addFilterBefore(signInThrottle(SIGN_IN_WINDOWS), CsrfFilter.class)
            .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
            .addFilterBefore(sessionFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    private static final class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
                throws ServletException, IOException {
            CsrfToken csrfToken = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
            if (csrfToken != null) {
                csrfToken.getToken();
            }
            filterChain.doFilter(request, response);
        }
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(
        @Value("${capvault.cors.allowed-origins:http://127.0.0.1:5173,http://localhost:5173}") String allowedOrigins
    ) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(splitOrigins(allowedOrigins));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("X-CSRF-TOKEN", "X-XSRF-TOKEN", "Content-Type", "Accept"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }

    /**
     * Fixed-window throttle for the public credential-exchange endpoint, per
     * client identity, so failed sign-in bursts cannot be replayed without
     * waiting for the retry window.
     */
    static Filter signInThrottle(Map<String, Window> windows) {
        return new Filter() {
            private static final int LIMIT = 5;
            private static final long WINDOW_MILLIS = 60_000;

            @Override
            public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
                HttpServletRequest http = (HttpServletRequest) request;
                HttpServletResponse httpResponse = (HttpServletResponse) response;
                if (!SIGN_IN_PATH.equals(http.getRequestURI()) || !"POST".equalsIgnoreCase(http.getMethod())) {
                    chain.doFilter(request, response);
                    return;
                }

                String client = clientIdentity(http);
                long now = System.currentTimeMillis();
                Window window = windows.compute(client, (key, current) ->
                    current == null || now - current.start >= WINDOW_MILLIS ? new Window(now) : current);
                int attempt = window.counter.incrementAndGet();
                if (attempt > LIMIT) {
                    httpResponse.setHeader("Retry-After", "60");
                    httpResponse.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                    httpResponse.setContentType("application/json");
                    httpResponse.getWriter().write(
                        "{\"timestamp\":\"\",\"status\":429,\"error\":\"Too many attempts. Try again shortly.\",\"fieldErrors\":{}}");
                    return;
                }
                chain.doFilter(request, response);
            }
        };
    }

    private static String clientIdentity(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }

    private static List<String> splitOrigins(String allowedOrigins) {
        return List.of(allowedOrigins.split(","))
            .stream()
            .map(String::trim)
            .filter(origin -> !origin.isBlank())
            .toList();
    }

    static void resetSignInThrottle() {
        SIGN_IN_WINDOWS.clear();
    }

    static final class Window {
        private final long start;
        private final AtomicInteger counter = new AtomicInteger();

        private Window(long start) {
            this.start = start;
        }
    }
}
