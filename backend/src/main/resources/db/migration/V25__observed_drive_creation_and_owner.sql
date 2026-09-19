ALTER TABLE academic_file_check_reports
    ADD COLUMN drive_created_time VARCHAR(80);

ALTER TABLE academic_file_check_reports
    ADD COLUMN drive_owner_display VARCHAR(500);
