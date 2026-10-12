package com.capvault.backend.drivehistory.auth;

import java.time.Instant;
import java.util.Optional;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DriveOAuthLoginStateRepository extends JpaRepository<DriveOAuthLoginState, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from DriveOAuthLoginState s where s.stateHash = :stateHash")
    Optional<DriveOAuthLoginState> lockByStateHash(@Param("stateHash") String stateHash);

    @Modifying
    @Query("delete from DriveOAuthLoginState s where s.expiresAt < :now")
    void deleteExpired(@Param("now") Instant now);
}
