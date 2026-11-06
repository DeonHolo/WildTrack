package com.capvault.backend.tracker;

public enum TrackerWritebackStatus {
    LOCAL_UPDATED,
    PENDING_SHEET_WRITE,
    WRITTEN_TO_SHEET,
    PENDING_GOOGLE_CREDENTIALS,
    FAILED,
    UNCERTAIN,
    SUPERSEDED
}
