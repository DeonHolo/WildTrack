package com.capvault.backend.drivehistory.auth;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DriveOAuthGrantRepository extends JpaRepository<DriveOAuthGrant, String> { }
