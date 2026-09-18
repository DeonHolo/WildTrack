package com.capvault.backend.deliverable;

public enum DeliverableFieldType {
    GENERAL_URL,
    DRIVE_PDF,
    GOOGLE_FORM,
    GOOGLE_SHEET,
    DRIVE_FOLDER,
    TEXTAREA,
    SHORT_TEXT,
    DROPDOWN,
    MULTIPLE_CHOICE,
    CHECKBOXES,
    ACADEMIC_STUDENT_NUMBER,
    ACADEMIC_STUDENT_NAME,
    ACADEMIC_TEAM_CODE,
    ACADEMIC_SECTION;

    public boolean isChoice() {
        return this == DROPDOWN || this == MULTIPLE_CHOICE || this == CHECKBOXES;
    }

    public boolean isAcademicIdentity() {
        return this == ACADEMIC_STUDENT_NUMBER
            || this == ACADEMIC_STUDENT_NAME
            || this == ACADEMIC_TEAM_CODE
            || this == ACADEMIC_SECTION;
    }
}
