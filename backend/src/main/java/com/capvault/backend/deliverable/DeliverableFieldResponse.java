package com.capvault.backend.deliverable;

import java.util.List;

public record DeliverableFieldResponse(
    String id,
    String fieldKey,
    String label,
    String helpText,
    DeliverableFieldType fieldType,
    boolean required,
    int displayOrder,
    DocumentCheckPolicy documentCheckPolicy,
    boolean aiReviewEnabled,
    boolean active,
    List<DeliverableFieldOptionResponse> options
) {
    public static DeliverableFieldResponse from(DeliverableField field, List<DeliverableFieldOption> options) {
        return new DeliverableFieldResponse(field.getId(), field.getFieldKey(), field.getLabel(), field.getHelpText(),
            field.getFieldType(), field.isRequired(), field.getDisplayOrder(), field.getDocumentCheckPolicy(),
            field.isAiReviewEnabled(), field.isActive(),
            options.stream().map(DeliverableFieldOptionResponse::from).toList());
    }
}
