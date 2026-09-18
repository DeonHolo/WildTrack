ALTER TABLE academic_deliverable_fields
    ADD COLUMN help_text VARCHAR(1000);

CREATE TABLE academic_deliverable_field_options (
    id             VARCHAR(80)  PRIMARY KEY,
    field_id       VARCHAR(80)  NOT NULL REFERENCES academic_deliverable_fields(id) ON DELETE CASCADE,
    label          VARCHAR(240) NOT NULL,
    display_order  INTEGER      NOT NULL DEFAULT 0,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_deliverable_field_options_field
    ON academic_deliverable_field_options(field_id, display_order);
