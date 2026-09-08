ALTER TABLE staff_role_assignments ADD COLUMN adviser_name VARCHAR(200);

-- Serialize directory edits and first-login binding across application instances.
CREATE TABLE staff_directory_lock (id INTEGER PRIMARY KEY);
INSERT INTO staff_directory_lock (id) VALUES (1);

