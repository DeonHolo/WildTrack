package com.capvault.backend.response;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResponseFeedbackRepository extends JpaRepository<ResponseFeedback, UUID> {

    List<ResponseFeedback> findAllByResponseIdOrderByUpdatedAtDesc(UUID responseId);

    Optional<ResponseFeedback> findByResponseIdAndAuthorSubject(UUID responseId, String authorSubject);
}
