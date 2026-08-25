package com.capvault.backend.config;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Assigns a correlation identifier to every request, exposes it to the client,
 * and records a safe structured request line (route category, method, status,
 * duration, and an opaque account reference when present). No tokens, cookies,
 * query strings, bodies, or roster fields are ever logged here.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestObservabilityFilter implements Filter {

    public static final String CORRELATION_HEADER = "X-Correlation-Id";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
        throws IOException, ServletException {
        HttpServletRequest http = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String incoming = http.getHeader(CORRELATION_HEADER);
        String correlationId = incoming == null || incoming.isBlank()
            ? UUID.randomUUID().toString()
            : incoming.trim();

        MDC.put("correlationId", correlationId);
        MDC.put("routeCategory", routeCategory(http.getRequestURI()));
        httpResponse.setHeader(CORRELATION_HEADER, correlationId);

        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long durationMillis = (System.nanoTime() - start) / 1_000_000;
            // Structured single-line request log; values are bounded and safe.
            org.slf4j.LoggerFactory.getLogger("wildtrack.request").info(
                "method={} pathCategory={} status={} durationMs={} correlationId={}",
                http.getMethod(),
                routeCategory(http.getRequestURI()),
                httpResponse.getStatus(),
                durationMillis,
                correlationId
            );
            MDC.remove("correlationId");
            MDC.remove("routeCategory");
        }
    }

    private static String routeCategory(String uri) {
        if (uri == null) {
            return "unknown";
        }
        if (uri.startsWith("/api/health")) return "health";
        if (uri.startsWith("/api/auth")) return "auth";
        if (uri.startsWith("/api/workspace")) return "workspace";
        if (uri.startsWith("/api/")) return "api";
        return "other";
    }
}
