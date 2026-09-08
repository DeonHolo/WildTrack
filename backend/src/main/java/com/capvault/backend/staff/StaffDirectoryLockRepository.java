package com.capvault.backend.staff;

public interface StaffDirectoryLockRepository extends org.springframework.data.jpa.repository.JpaRepository<StaffDirectoryLock, Integer> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select l from StaffDirectoryLock l where l.id = 1")
    StaffDirectoryLock lockDirectory();
}
