
CREATE TABLE public.conversation_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own status history"
ON public.conversation_status_history FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own status history"
ON public.conversation_status_history FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_status_history_conv ON public.conversation_status_history(conversation_id, created_at DESC);

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT now();
