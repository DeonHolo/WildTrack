package com.capvault.backend.staff;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Bootstrap allowlist for initial staff identities, sourced from
 * WILDTRACK_STAFF_BOOTSTRAP_ASSIGNMENTS so no personal emails are hardcoded.
 *
 * Format: ROLE:identifier;ROLE:identifier  e.g.
 * ADMIN:sir.ralph@gmail.com;ADVISER:adviser@school.edu
 */
@Component
public class StaffBootstrapProperties {

    private final Map<StaffRole, List<String>> assignments = new LinkedHashMap<>();

    public StaffBootstrapProperties(Environment environment) {
        String raw = environment.getProperty("wildtrack.staff.bootstrap.assignments", "");
        if (raw == null || raw.isBlank()) {
            return;
        }
        for (String group : raw.split(";")) {
            String[] parts = group.split(":", 2);
            if (parts.length != 2) continue;
            try {
                StaffRole role = StaffRole.valueOf(parts[0].trim().toUpperCase());
                List<String> identifiers = Arrays.stream(parts[1].split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .toList();
                assignments.put(role, identifiers);
            } catch (IllegalArgumentException ignored) {
                // Unknown role names in configuration are skipped rather than failing startup.
            }
        }
    }

    public boolean contains(String googleSubject, String googleEmail, StaffRole role) {
        List<String> identifiers = assignments.get(role);
        if (identifiers == null) return false;
        return identifiers.stream().anyMatch(entry ->
            entry.equals(googleSubject) || entry.equalsIgnoreCase(googleEmail));
    }

    public Map<StaffRole, List<String>> getAssignments() {
        return assignments;
    }
}
