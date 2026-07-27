package com.capvault.backend.filecheck;

public record DriveConnectionStatus(
    boolean configured,
    String message
) {
}
