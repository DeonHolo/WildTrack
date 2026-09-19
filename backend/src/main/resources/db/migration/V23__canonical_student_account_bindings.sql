CREATE TABLE canonical_student_account_bindings (
    student_number_key          VARCHAR(80)   PRIMARY KEY,
    google_subject              VARCHAR(255),
    google_email                VARCHAR(255),
    blocked_google_subject      VARCHAR(255),
    blocked_google_email        VARCHAR(255),
    status                      VARCHAR(32)    NOT NULL DEFAULT 'UNBOUND',
    created_at                  TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at                  TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX uq_canonical_student_binding_subject
    ON canonical_student_account_bindings(google_subject);

INSERT INTO canonical_student_account_bindings (
    student_number_key,
    status,
    created_at,
    updated_at
)
SELECT LOWER(TRIM(student_number)), 'UNBOUND', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM academic_student_records
WHERE student_number IS NOT NULL AND TRIM(student_number) <> ''
GROUP BY LOWER(TRIM(student_number));
