ALTER TABLE form_responses ADD COLUMN current_student_key VARCHAR(80);

-- Preserve every prior account's response and its references. The most recent
-- successful save is the sole current submission for this student/deliverable.
UPDATE form_responses SET current_student_key = LOWER(TRIM(student_number))
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY workspace_id, deliverable_id, LOWER(TRIM(student_number))
            ORDER BY updated_at DESC, submitted_at DESC, id DESC
        ) AS response_rank FROM form_responses
    ) ranked WHERE response_rank = 1
);
ALTER TABLE form_responses ADD CONSTRAINT uq_response_current_student
    UNIQUE (workspace_id, deliverable_id, current_student_key);

-- Older captures remain retrievable in Inactive history with their stored files.
UPDATE archive_records SET active = FALSE, state_version = state_version + 1
WHERE active = TRUE AND response_id IN (SELECT id FROM form_responses WHERE current_student_key IS NULL);
