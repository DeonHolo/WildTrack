CREATE TABLE academic_workspaces (
    id UUID PRIMARY KEY,
    name VARCHAR(240) NOT NULL,
    program VARCHAR(80) NOT NULL,
    course_code VARCHAR(120) NOT NULL,
    semester VARCHAR(80) NOT NULL,
    academic_year VARCHAR(40) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_academic_workspace_identity
        UNIQUE (program, course_code, semester, academic_year)
);

INSERT INTO academic_workspaces (
    id,
    name,
    program,
    course_code,
    semester,
    academic_year,
    active,
    created_at,
    updated_at
) VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        'IT Capstone - IT332 - Semester 2 2025-26',
        'IT',
        'IT332',
        'Semester 2',
        '2025-26',
        TRUE,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    ),
    (
        '22222222-2222-2222-2222-222222222222',
        'CS Capstone - Semester 2 2025-26',
        'CS',
        'CS Capstone',
        'Semester 2',
        '2025-26',
        TRUE,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );

CREATE TABLE academic_workspace_sources (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    sheet_url VARCHAR(2048) NOT NULL,
    sheet_id VARCHAR(200) NOT NULL,
    display_name VARCHAR(200),
    status VARCHAR(40) NOT NULL,
    connected_at TIMESTAMP NOT NULL,
    last_imported_at TIMESTAMP,
    CONSTRAINT fk_academic_workspace_sources_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT uk_academic_workspace_source
        UNIQUE (workspace_id, source_type)
);

CREATE TABLE academic_deliverables (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    tracker_column_key VARCHAR(160) NOT NULL,
    title VARCHAR(240) NOT NULL,
    slug VARCHAR(180) NOT NULL,
    instructions VARCHAR(4000),
    due_at TIMESTAMP NOT NULL,
    pdf_required BOOLEAN NOT NULL,
    status VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_deliverables_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT uk_academic_deliverable_slug
        UNIQUE (workspace_id, slug)
);

CREATE INDEX idx_academic_deliverables_workspace_due
    ON academic_deliverables (workspace_id, due_at);

CREATE TABLE academic_sheet_import_runs (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id UUID,
    status VARCHAR(40) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    rows_found INTEGER NOT NULL,
    columns_found INTEGER NOT NULL,
    warnings TEXT,
    summary_json TEXT,
    CONSTRAINT fk_academic_import_runs_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT fk_academic_import_runs_source
        FOREIGN KEY (source_id)
        REFERENCES academic_workspace_sources (id)
);

CREATE TABLE academic_student_records (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    student_number VARCHAR(80),
    student_name VARCHAR(240) NOT NULL,
    team_code VARCHAR(160) NOT NULL,
    member_number VARCHAR(40),
    section_name VARCHAR(120),
    adviser_name VARCHAR(200),
    institutional_email VARCHAR(240),
    source_row_number INTEGER,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_students_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT uk_academic_student_number
        UNIQUE (workspace_id, student_number)
);

CREATE INDEX idx_academic_students_workspace_team
    ON academic_student_records (workspace_id, team_code);

CREATE TABLE academic_project_metadata (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    group_code VARCHAR(160) NOT NULL,
    project_title VARCHAR(1000),
    software_name VARCHAR(500),
    description TEXT,
    proposal_remarks TEXT,
    demo_comments TEXT,
    adviser_name VARCHAR(240),
    project_status VARCHAR(240),
    category VARCHAR(240),
    source_row_number INTEGER,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_projects_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT uk_academic_project_group
        UNIQUE (workspace_id, group_code)
);

CREATE TABLE academic_tracker_columns (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    column_key VARCHAR(180) NOT NULL,
    label VARCHAR(180) NOT NULL,
    source_column VARCHAR(180) NOT NULL,
    source_column_index INTEGER NOT NULL,
    display_order INTEGER NOT NULL,
    active BOOLEAN NOT NULL,
    pdf_required BOOLEAN NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_tracker_columns_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT uk_academic_tracker_column
        UNIQUE (workspace_id, column_key)
);

CREATE TABLE academic_tracker_rows (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    student_number VARCHAR(80),
    student_name VARCHAR(240) NOT NULL,
    team_code VARCHAR(160) NOT NULL,
    member_number VARCHAR(40),
    section_name VARCHAR(120),
    adviser_name VARCHAR(200),
    source_row_number INTEGER NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_tracker_rows_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id)
);

CREATE INDEX idx_academic_tracker_rows_student
    ON academic_tracker_rows (workspace_id, student_number);

CREATE INDEX idx_academic_tracker_rows_team_member
    ON academic_tracker_rows (workspace_id, team_code, member_number);

CREATE TABLE academic_tracker_cells (
    id UUID PRIMARY KEY,
    tracker_row_id UUID NOT NULL,
    tracker_column_id UUID NOT NULL,
    raw_value VARCHAR(1000),
    normalized_status VARCHAR(80) NOT NULL,
    source_row_number INTEGER NOT NULL,
    source_column_index INTEGER NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_academic_tracker_cells_row
        FOREIGN KEY (tracker_row_id)
        REFERENCES academic_tracker_rows (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_academic_tracker_cells_column
        FOREIGN KEY (tracker_column_id)
        REFERENCES academic_tracker_columns (id)
        ON DELETE CASCADE,
    CONSTRAINT uk_academic_tracker_cell
        UNIQUE (tracker_row_id, tracker_column_id)
);

CREATE TABLE academic_tracker_writebacks (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    student_number VARCHAR(80),
    team_code VARCHAR(160) NOT NULL,
    member_number VARCHAR(40),
    deliverable_id UUID,
    tracker_column_key VARCHAR(180) NOT NULL,
    days_late INTEGER NOT NULL,
    target_row_number INTEGER,
    target_column_index INTEGER,
    target_a1_range VARCHAR(240),
    status VARCHAR(80) NOT NULL,
    message VARCHAR(1000),
    requested_at TIMESTAMP NOT NULL,
    written_at TIMESTAMP,
    CONSTRAINT fk_academic_writebacks_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES academic_workspaces (id),
    CONSTRAINT fk_academic_writebacks_deliverable
        FOREIGN KEY (deliverable_id)
        REFERENCES academic_deliverables (id)
);

CREATE INDEX idx_academic_writebacks_student
    ON academic_tracker_writebacks (workspace_id, student_number);

CREATE INDEX idx_academic_writebacks_team
    ON academic_tracker_writebacks (workspace_id, team_code);

INSERT INTO academic_workspace_sources (
    id,
    workspace_id,
    source_type,
    sheet_url,
    sheet_id,
    display_name,
    status,
    connected_at,
    last_imported_at
)
SELECT
    id,
    '11111111-1111-1111-1111-111111111111',
    source_type,
    sheet_url,
    sheet_id,
    display_name,
    status,
    connected_at,
    last_imported_at
FROM workspace_sources;

INSERT INTO academic_deliverables (
    id,
    workspace_id,
    tracker_column_key,
    title,
    slug,
    instructions,
    due_at,
    pdf_required,
    status,
    created_at,
    updated_at
)
SELECT
    id,
    '11111111-1111-1111-1111-111111111111',
    tracker_column_key,
    title,
    slug,
    instructions,
    due_at,
    pdf_required,
    status,
    created_at,
    updated_at
FROM deliverables;

INSERT INTO academic_student_records (
    id,
    workspace_id,
    student_number,
    student_name,
    team_code,
    member_number,
    section_name,
    adviser_name,
    institutional_email,
    source_row_number,
    updated_at
)
SELECT
    id,
    '11111111-1111-1111-1111-111111111111',
    student_number,
    student_name,
    team_code,
    member_number,
    section_name,
    adviser_name,
    institutional_email,
    source_row_number,
    updated_at
FROM student_records;

INSERT INTO academic_project_metadata (
    id,
    workspace_id,
    group_code,
    project_title,
    software_name,
    description,
    proposal_remarks,
    demo_comments,
    adviser_name,
    project_status,
    category,
    source_row_number,
    updated_at
)
SELECT
    id,
    '11111111-1111-1111-1111-111111111111',
    group_code,
    project_title,
    software_name,
    description,
    proposal_remarks,
    demo_comments,
    adviser_name,
    project_status,
    category,
    source_row_number,
    updated_at
FROM project_metadata;

INSERT INTO academic_tracker_columns (
    id,
    workspace_id,
    column_key,
    label,
    source_column,
    source_column_index,
    display_order,
    active,
    pdf_required,
    updated_at
)
SELECT
    id,
    '11111111-1111-1111-1111-111111111111',
    column_key,
    label,
    source_column,
    source_column_index,
    display_order,
    active,
    pdf_required,
    updated_at
FROM tracker_columns;

INSERT INTO academic_tracker_rows (
    id,
    workspace_id,
    student_number,
    student_name,
    team_code,
    member_number,
    section_name,
    adviser_name,
    source_row_number,
    updated_at
)
SELECT
    id,
    '11111111-1111-1111-1111-111111111111',
    student_number,
    student_name,
    team_code,
    member_number,
    section_name,
    adviser_name,
    source_row_number,
    updated_at
FROM tracker_rows;

INSERT INTO academic_tracker_cells (
    id,
    tracker_row_id,
    tracker_column_id,
    raw_value,
    normalized_status,
    source_row_number,
    source_column_index,
    updated_at
)
SELECT
    id,
    tracker_row_id,
    tracker_column_id,
    raw_value,
    normalized_status,
    source_row_number,
    source_column_index,
    updated_at
FROM tracker_cells;

INSERT INTO academic_tracker_writebacks (
    id,
    workspace_id,
    student_number,
    team_code,
    member_number,
    deliverable_id,
    tracker_column_key,
    days_late,
    target_row_number,
    target_column_index,
    target_a1_range,
    status,
    message,
    requested_at,
    written_at
)
SELECT
    id,
    '11111111-1111-1111-1111-111111111111',
    student_number,
    team_code,
    member_number,
    deliverable_id,
    tracker_column_key,
    days_late,
    target_row_number,
    target_column_index,
    target_a1_range,
    status,
    message,
    requested_at,
    written_at
FROM tracker_writebacks;

