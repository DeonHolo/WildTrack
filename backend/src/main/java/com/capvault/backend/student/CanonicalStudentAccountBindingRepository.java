package com.capvault.backend.student;

import java.util.Optional;
import java.util.List;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CanonicalStudentAccountBindingRepository extends JpaRepository<CanonicalStudentAccountBinding, String> {

    Optional<CanonicalStudentAccountBinding> findByGoogleSubject(String googleSubject);

    List<CanonicalStudentAccountBinding> findAllByGoogleEmailIgnoreCase(String googleEmail);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select binding from CanonicalStudentAccountBinding binding where binding.studentNumberKey = :key")
    Optional<CanonicalStudentAccountBinding> lockByStudentNumberKey(@Param("key") String key);
}
