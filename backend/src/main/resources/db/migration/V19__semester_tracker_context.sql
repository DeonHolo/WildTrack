ALTER TABLE academic_student_records
    ADD COLUMN team_formation_code VARCHAR(160);

ALTER TABLE academic_student_records
    ADD COLUMN software_title VARCHAR(500);

ALTER TABLE academic_student_records
    ADD COLUMN current_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE academic_student_records
SET team_formation_code = team_code
WHERE team_formation_code IS NULL;

CREATE INDEX idx_academic_students_team_formation_code
    ON academic_student_records (workspace_id, team_formation_code);

ALTER TABLE academic_project_metadata
    ADD COLUMN current_group_code VARCHAR(160);

ALTER TABLE academic_project_metadata
    ADD COLUMN current_software_name VARCHAR(500);

ALTER TABLE academic_project_metadata
    ADD COLUMN current_adviser_name VARCHAR(240);

CREATE INDEX idx_academic_projects_current_group
    ON academic_project_metadata (workspace_id, current_group_code);
