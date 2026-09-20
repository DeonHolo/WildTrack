package com.capvault.backend.drivehistory.auth;

import java.util.Optional;
import java.time.Instant;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DriveOAuthPendingStateRepository extends JpaRepository<DriveOAuthPendingState, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from DriveOAuthPendingState s where s.stateHash = :stateHash")
    Optional<DriveOAuthPendingState> lockByStateHash(@Param("stateHash") String stateHash);

    @Modifying
    @Query("delete from DriveOAuthPendingState s where s.expiresAt < :now")
    void deleteExpired(@Param("now") Instant now);
}
