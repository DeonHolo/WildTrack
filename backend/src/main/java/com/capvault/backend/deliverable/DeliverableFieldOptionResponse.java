package com.capvault.backend.deliverable;

public record DeliverableFieldOptionResponse(
    String id,
    String label
) {
    public static DeliverableFieldOptionResponse from(DeliverableFieldOption option) {
        return new DeliverableFieldOptionResponse(option.getId(), option.getLabel());
    }
}
