-- Identity conflicts become a decidable Admin queue: a decision is persisted with who
-- made it, when, and an optional note, and the row leaves the OPEN list afterwards.
ALTER TABLE student_identity_conflicts ADD COLUMN decided_at TIMESTAMP;
ALTER TABLE student_identity_conflicts ADD COLUMN decided_by_subject VARCHAR(255);
ALTER TABLE student_identity_conflicts ADD COLUMN decided_by_email VARCHAR(255);
ALTER TABLE student_identity_conflicts ADD COLUMN decision_note VARCHAR(1000);

CREATE INDEX idx_conflict_workspace_status ON student_identity_conflicts(workspace_id, status);
