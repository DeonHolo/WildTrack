package com.capvault.backend.config;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
@Profile("production")
class ProductionConfigurationValidator implements InitializingBean {

    private final Environment environment;

    ProductionConfigurationValidator(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void afterPropertiesSet() {
        List<String> problems = new ArrayList<>();

        String databaseUrl = value("spring.datasource.url");
        if (databaseUrl == null || !databaseUrl.startsWith("jdbc:postgresql://")) {
            problems.add("a PostgreSQL datasource URL is required");
        }
        requireNonBlank("spring.datasource.username", "a database username is required", problems);
        requireNonBlank("spring.datasource.password", "a database password is required", problems);

        if (!environment.getProperty("wildtrack.google.identity.enabled", Boolean.class, false)) {
            problems.add("Google Identity must be enabled");
        }
        requireNonBlank(
            "wildtrack.google.identity.client-id",
            "a Google Identity client ID is required",
            problems
        );
        requireNonBlank(
            "wildtrack.staff.bootstrap.assignments",
            "at least one staff bootstrap assignment is required",
            problems
        );

        if (!environment.getProperty("wildtrack.session.secure-cookie", Boolean.class, false)) {
            problems.add("a secure cookie is required");
        }

        String allowedOrigins = value("capvault.cors.allowed-origins");
        if (allowedOrigins == null || !allOriginsAreSafe(allowedOrigins)) {
            problems.add("every CORS origin must be an exact non-local HTTPS origin");
        }

        if (!problems.isEmpty()) {
            throw new IllegalStateException(
                "Unsafe WildTrack production configuration: " + String.join("; ", problems)
            );
        }
    }

    private void requireNonBlank(String key, String message, List<String> problems) {
        if (value(key) == null) {
            problems.add(message);
        }
    }

    private String value(String key) {
        String configured = environment.getProperty(key);
        if (configured == null || configured.isBlank()) {
            return null;
        }
        return configured.trim();
    }

    private static boolean allOriginsAreSafe(String allowedOrigins) {
        String[] origins = allowedOrigins.split(",", -1);
        return origins.length > 0 && Arrays.stream(origins)
            .map(String::trim)
            .allMatch(origin -> !origin.isBlank() && isSafeOrigin(origin));
    }


    private static boolean isSafeOrigin(String origin) {
        try {
            URI uri = URI.create(origin);
            return "https".equalsIgnoreCase(uri.getScheme())
                && uri.getHost() != null
                && !uri.getHost().isBlank()
                && uri.getUserInfo() == null
                && (uri.getPath() == null || uri.getPath().isEmpty())
                && uri.getQuery() == null
                && uri.getFragment() == null
                && !isLocalHost(uri.getHost());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static boolean isLocalHost(String host) {
        return "localhost".equalsIgnoreCase(host)
            || "127.0.0.1".equals(host)
            || "::1".equals(host);
    }
}
