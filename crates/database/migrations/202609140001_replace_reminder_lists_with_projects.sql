UPDATE reminders
SET list_id = 'reminders-inbox', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE list_id <> 'reminders-inbox';

DELETE FROM reminder_lists
WHERE id <> 'reminders-inbox';
