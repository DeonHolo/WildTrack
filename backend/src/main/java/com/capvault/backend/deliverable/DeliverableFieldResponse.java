package com.capvault.backend.deliverable;

public record DeliverableFieldResponse(
    String id,
    String fieldKey,
    String label,
    DeliverableFieldType fieldType,
    boolean required,
    int displayOrder,
    DocumentCheckPolicy documentCheckPolicy,
    boolean aiReviewEnabled,
    boolean active
) {
    public static DeliverableFieldResponse from(DeliverableField field) {
        return new DeliverableFieldResponse(field.getId(), field.getFieldKey(), field.getLabel(),
            field.getFieldType(), field.isRequired(), field.getDisplayOrder(), field.getDocumentCheckPolicy(),
            field.isAiReviewEnabled(), field.isActive());
    }
}
