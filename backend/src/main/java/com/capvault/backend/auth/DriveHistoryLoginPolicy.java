package com.capvault.backend.auth;

import com.capvault.backend.drivehistory.auth.DelegatedDriveAccessService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Current rollout policy and locally usable, subject-owned Drive authorization. */
@Service
public class DriveHistoryLoginPolicy {
    private final boolean required;
    private final DelegatedDriveAccessService access;

    public DriveHistoryLoginPolicy(
        @Value("${wildtrack.drive-history.required-for-login:false}") boolean required,
        DelegatedDriveAccessService access
    ) {
        this.required = required;
        this.access = access;
    }

    public boolean required() { return required; }

    public Status status(String googleSubject) {
        boolean configured = access.isConfigured();
        return new Status(required, configured && googleSubject != null && access.connected(googleSubject), configured);
    }

    public record Status(boolean required, boolean connected, boolean configured) { }
}
