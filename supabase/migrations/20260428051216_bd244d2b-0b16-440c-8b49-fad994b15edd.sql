-- Multi-instância e grupos para AutoReply
ALTER TABLE public.autoreply_flows
  ADD COLUMN IF NOT EXISTS device_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS apply_to_all_devices boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_id uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill: se já existe device_id, copia para device_ids
UPDATE public.autoreply_flows
   SET device_ids = ARRAY[device_id]
 WHERE device_id IS NOT NULL
   AND (device_ids IS NULL OR cardinality(device_ids) = 0);

-- Tabela de grupos
CREATE TABLE IF NOT EXISTS public.autoreply_flow_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT 'emerald',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.autoreply_flow_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own flow groups" ON public.autoreply_flow_groups;
CREATE POLICY "users manage own flow groups" ON public.autoreply_flow_groups
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.autoreply_flows
  DROP CONSTRAINT IF EXISTS autoreply_flows_group_id_fkey;
ALTER TABLE public.autoreply_flows
  ADD CONSTRAINT autoreply_flows_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.autoreply_flow_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_autoreply_flows_group ON public.autoreply_flows(group_id);
CREATE INDEX IF NOT EXISTS idx_autoreply_flows_device_ids ON public.autoreply_flows USING gin(device_ids);

DROP TRIGGER IF EXISTS update_autoreply_flow_groups_updated_at ON public.autoreply_flow_groups;
CREATE TRIGGER update_autoreply_flow_groups_updated_at
  BEFORE UPDATE ON public.autoreply_flow_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();