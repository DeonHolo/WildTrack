package com.capvault.backend.response;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FormResponseRepository extends JpaRepository<FormResponse, UUID> {

    Optional<FormResponse> findByWorkspaceIdAndDeliverableIdAndGoogleSubject(UUID workspaceId, UUID deliverableId, String googleSubject);

    List<FormResponse> findAllByWorkspaceId(UUID workspaceId);

    List<FormResponse> findAllByDeliverableId(UUID deliverableId);

    List<FormResponse> findAllByWorkspaceIdAndGoogleSubject(UUID workspaceId, String googleSubject);
}
