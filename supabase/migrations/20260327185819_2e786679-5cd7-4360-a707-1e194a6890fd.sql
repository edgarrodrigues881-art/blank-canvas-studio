ALTER TABLE public.group_interaction_logs
ALTER COLUMN group_id TYPE text
USING group_id::text;