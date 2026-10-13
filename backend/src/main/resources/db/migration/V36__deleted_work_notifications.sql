-- Personal notification deletion must not reopen the dismissed work on refresh.
-- Preserve dismissal keys as lightweight tombstones; retain all audit evidence.
ALTER TABLE work_task_dismissals ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
