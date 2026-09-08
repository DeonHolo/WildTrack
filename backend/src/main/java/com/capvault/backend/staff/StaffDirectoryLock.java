package com.capvault.backend.staff;

@jakarta.persistence.Entity
@jakarta.persistence.Table(name = "staff_directory_lock")
public class StaffDirectoryLock {
    @jakarta.persistence.Id
    private Integer id;
    protected StaffDirectoryLock() { }
}
