package com.capvault.backend.staff;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StaffAccessService {

    private final StaffRoleAssignmentRepository repository;
    private final StaffBootstrapProperties bootstrapProperties;
    private final Clock clock;

    public StaffAccessService(
        StaffRoleAssignmentRepository repository,
        StaffBootstrapProperties bootstrapProperties,
        Clock clock
    ) {
        this.repository = repository;
        this.bootstrapProperties = bootstrapProperties;
        this.clock = clock;
    }

    @Transactional
    public void bindStaffRolesOnFirstLogin(String googleSubject, String googleEmail) {
        for (StaffRole role : StaffRole.values()) {
            boolean allowed = bootstrapProperties.contains(googleSubject, googleEmail, role);
            var existing = repository.findByGoogleSubjectAndRole(googleSubject, role);
            if (allowed && existing.isEmpty()) {
                repository.save(new StaffRoleAssignment(
                    UUID.randomUUID(),
                    googleSubject,
                    googleEmail,
                    role,
                    true,
                    clock.instant(),
                    clock.instant()
                ));
            }
        }
    }

    @Transactional(readOnly = true)
    public List<StaffRole> activeRolesFor(String googleSubject) {
        return repository.findByGoogleSubjectAndEnabledTrue(googleSubject).stream()
            .map(StaffRoleAssignment::getRole)
            .toList();
    }

    @Transactional
    public void setEnabled(String googleSubject, StaffRole role, boolean enabled) {
        repository.findByGoogleSubjectAndRole(googleSubject, role).ifPresentOrElse(
            assignment -> {
                assignment.setEnabled(enabled);
                assignment.setUpdatedAt(clock.instant());
                repository.save(assignment);
            },
            () -> {
                throw new IllegalArgumentException("No staff assignment exists for that subject and role.");
            }
        );
    }
}
