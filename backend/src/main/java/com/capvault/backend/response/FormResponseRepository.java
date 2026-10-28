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

    List<FormResponse> findAllByWorkspaceId(UUID workspaceId);

    List<FormResponse> findAllByDeliverableId(UUID deliverableId);

    boolean existsByDeliverableId(UUID deliverableId);

    List<FormResponse> findAllByWorkspaceIdAndGoogleSubject(UUID workspaceId, String googleSubject);
}
