CREATE TABLE staff_role_assignments (
    id             UUID          PRIMARY KEY,
    google_subject VARCHAR(255)  NOT NULL,
    google_email   VARCHAR(255)  NOT NULL,
    role           VARCHAR(32)   NOT NULL,
    enabled        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP     NOT NULL,
    updated_at     TIMESTAMP     NOT NULL,
    CONSTRAINT uq_staff_subject_role UNIQUE (google_subject, role),
    CONSTRAINT chk_staff_role CHECK (role IN ('ADMIN','ADVISER'))
);

CREATE INDEX idx_staff_assignments_email ON staff_role_assignments(google_email);
