package com.capvault.backend.staff;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StaffRoleAssignmentRepository extends JpaRepository<StaffRoleAssignment, UUID> {

    List<StaffRoleAssignment> findByGoogleSubjectAndEnabledTrue(String googleSubject);

    Optional<StaffRoleAssignment> findByGoogleSubjectAndRole(String googleSubject, StaffRole role);

    List<StaffRoleAssignment> findByGoogleEmailIgnoreCaseAndEnabledTrue(String googleEmail);
}
