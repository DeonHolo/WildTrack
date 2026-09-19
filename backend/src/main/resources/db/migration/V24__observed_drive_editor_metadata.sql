ALTER TABLE academic_file_check_reports
    ADD COLUMN drive_last_modifying_user_email VARCHAR(320);

ALTER TABLE academic_file_check_reports
    ADD COLUMN drive_last_modifying_user_display_name VARCHAR(500);
