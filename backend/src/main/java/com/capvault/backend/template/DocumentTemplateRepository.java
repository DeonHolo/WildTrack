package com.capvault.backend.template;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DocumentTemplateRepository extends JpaRepository<DocumentTemplate, UUID> {

    @Query("""
        select new com.capvault.backend.template.DocumentTemplateResponse(
            t.id, t.workspaceId, t.deliverableKey, t.fieldId, t.displayName,
            t.originalFilename, t.contentType, t.sha256, t.extractedCharacterCount, t.updatedAt)
        from DocumentTemplate t
        where t.workspaceId = :workspaceId
        order by t.deliverableKey asc
        """)
    List<DocumentTemplateResponse> findSummariesByWorkspaceIdOrderByDeliverableKeyAsc(
        @Param("workspaceId") UUID workspaceId);

    @Query("""
        select new com.capvault.backend.template.DocumentTemplateText(t.id, t.extractedText, t.sha256)
        from DocumentTemplate t
        where t.workspaceId = :workspaceId
          and upper(t.deliverableKey) = upper(:deliverableKey)
          and t.fieldId = :fieldId
        """)
    Optional<DocumentTemplateText> findTextByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldId(
        @Param("workspaceId") UUID workspaceId, @Param("deliverableKey") String deliverableKey,
        @Param("fieldId") String fieldId);

    @Query("""
        select new com.capvault.backend.template.DocumentTemplateText(t.id, t.extractedText, t.sha256)
        from DocumentTemplate t
        where t.workspaceId = :workspaceId
          and upper(t.deliverableKey) = upper(:deliverableKey)
          and t.fieldId is null
        """)
    Optional<DocumentTemplateText> findTextByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldIdIsNull(
        @Param("workspaceId") UUID workspaceId, @Param("deliverableKey") String deliverableKey);

    List<DocumentTemplate> findAllByWorkspaceIdOrderByDeliverableKeyAsc(UUID workspaceId);

    Optional<DocumentTemplate> findByWorkspaceIdAndDeliverableKeyIgnoreCase(
        UUID workspaceId,
        String deliverableKey
    );

    Optional<DocumentTemplate> findByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldId(
        UUID workspaceId, String deliverableKey, String fieldId);

    Optional<DocumentTemplate> findByWorkspaceIdAndDeliverableKeyIgnoreCaseAndFieldIdIsNull(
        UUID workspaceId, String deliverableKey);
}
