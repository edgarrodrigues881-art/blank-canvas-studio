-- Set all existing group interactions to unlimited (0 = no limit)
UPDATE group_interactions SET daily_limit_total = 0 WHERE daily_limit_total > 0;

-- Change the default for new interactions to 0 (unlimited)
ALTER TABLE group_interactions ALTER COLUMN daily_limit_total SET DEFAULT 0;