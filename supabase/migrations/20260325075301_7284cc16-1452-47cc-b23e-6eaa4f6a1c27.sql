ALTER TABLE public.mass_inject_campaigns
ADD COLUMN IF NOT EXISTS assignment_mode text NOT NULL DEFAULT 'single',
ADD COLUMN IF NOT EXISTS group_targets jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.mass_inject_contacts
ADD COLUMN IF NOT EXISTS target_group_id text,
ADD COLUMN IF NOT EXISTS target_group_name text;

UPDATE public.mass_inject_campaigns
SET group_targets = CASE
  WHEN jsonb_typeof(group_targets) = 'array' AND jsonb_array_length(group_targets) > 0 THEN group_targets
  ELSE jsonb_build_array(
    jsonb_build_object(
      'group_id', group_id,
      'group_name', COALESCE(group_name, group_id),
      'device_ids', COALESCE(device_ids, '[]'::jsonb)
    )
  )
END,
assignment_mode = CASE
  WHEN jsonb_typeof(group_targets) = 'array' AND jsonb_array_length(group_targets) > 1 THEN 'multi_group_round_robin'
  ELSE COALESCE(NULLIF(assignment_mode, ''), 'single')
END;

UPDATE public.mass_inject_contacts AS mic
SET target_group_id = c.group_id,
    target_group_name = COALESCE(c.group_name, c.group_id)
FROM public.mass_inject_campaigns AS c
WHERE c.id = mic.campaign_id
  AND (mic.target_group_id IS NULL OR mic.target_group_name IS NULL);

ALTER TABLE public.mass_inject_contacts
ALTER COLUMN target_group_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mass_inject_contacts_campaign_group_status
ON public.mass_inject_contacts (campaign_id, target_group_id, status);