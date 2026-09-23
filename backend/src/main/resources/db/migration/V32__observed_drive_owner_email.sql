-- Structured Google Drive owner email used solely for authorized staff identity attribution.
-- Older observations intentionally remain null; provider display names cannot prove identity.
ALTER TABLE academic_file_check_reports ADD COLUMN drive_owner_email VARCHAR(320);
