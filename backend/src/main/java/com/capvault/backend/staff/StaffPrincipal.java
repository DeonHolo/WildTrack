package com.capvault.backend.staff;

import java.util.Set;

public record StaffPrincipal(
    String googleSubject,
    String googleEmail,
    Set<StaffRole> roles
) {
    public boolean hasAny(StaffRole... required) {
        for (StaffRole role : required) {
            if (roles.contains(role)) {
                return true;
            }
        }
        return false;
    }

    public static StaffPrincipal anonymous() {
        return new StaffPrincipal(null, null, Set.of());
    }
}
