package com.capvault.backend.filecheck;

public record DriveFailureDetails(
    String stage,
    String category,
    String code,
    Integer upstreamStatus,
    String reason,
    String causeType,
    Long elapsedMs,
    Long expectedBytes,
    Long actualBytes
) { }
