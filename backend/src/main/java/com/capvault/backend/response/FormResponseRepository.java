package com.capvault.backend.response;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FormResponseRepository extends JpaRepository<FormResponse, UUID> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select response from FormResponse response where response.id = :id")
    Optional<FormResponse> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") UUID id);

    Optional<FormResponse> findByWorkspaceIdAndDeliverableIdAndGoogleSubject(UUID workspaceId, UUID deliverableId, String googleSubject);

    @org.springframework.data.jpa.repository.Query("select r from FormResponse r where r.workspaceId = :workspaceId and r.currentStudentKey is not null")
    List<FormResponse> findAllByWorkspaceId(UUID workspaceId);

    @org.springframework.data.jpa.repository.Query("select r from FormResponse r where r.deliverableId = :deliverableId and r.currentStudentKey is not null")
    List<FormResponse> findAllByDeliverableId(UUID deliverableId);

    boolean existsByDeliverableId(UUID deliverableId);

    @org.springframework.data.jpa.repository.Query("select r from FormResponse r where r.workspaceId = :workspaceId and r.googleSubject = :googleSubject and r.currentStudentKey is not null")
    List<FormResponse> findAllByWorkspaceIdAndGoogleSubject(UUID workspaceId, String googleSubject);

    @org.springframework.data.jpa.repository.Query("select r from FormResponse r where r.workspaceId = :workspaceId and r.deliverableId = :deliverableId and lower(trim(r.studentNumber)) = :studentKey order by r.updatedAt desc, r.submittedAt desc, r.id desc")
    List<FormResponse> studentHistory(UUID workspaceId, UUID deliverableId, String studentKey);
}
