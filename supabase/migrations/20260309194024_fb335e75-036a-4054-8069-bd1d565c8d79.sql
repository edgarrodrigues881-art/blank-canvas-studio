
-- Message queue types
CREATE TYPE public.message_queue_type AS ENUM (
  'WELCOME',
  'DUE_3_DAYS',
  'DUE_TODAY',
  'OVERDUE_1',
  'OVERDUE_7',
  'OVERDUE_30'
);

CREATE TYPE public.message_queue_status AS ENUM (
  'pending',
  'sent',
  'failed'
);

-- Message queue table
CREATE TABLE public.message_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  client_phone TEXT,
  plan_name TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMP WITH TIME ZONE,
  message_type public.message_queue_type NOT NULL,
  status public.message_queue_status NOT NULL DEFAULT 'pending',
  message_content TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can manage the queue
CREATE POLICY "Admins can view all queue items"
  ON public.message_queue FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert queue items"
  ON public.message_queue FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update queue items"
  ON public.message_queue FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete queue items"
  ON public.message_queue FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for fast pending queries
CREATE INDEX idx_message_queue_status ON public.message_queue (status) WHERE status = 'pending';
CREATE INDEX idx_message_queue_user ON public.message_queue (user_id);
