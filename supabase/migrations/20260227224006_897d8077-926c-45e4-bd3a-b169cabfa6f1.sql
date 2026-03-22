
CREATE TABLE public.group_join_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_name text NOT NULL DEFAULT '',
  group_name text NOT NULL DEFAULT '',
  group_link text NOT NULL DEFAULT '',
  invite_code text NOT NULL DEFAULT '',
  endpoint_called text,
  request_summary text,
  response_status integer,
  response_body text,
  result text NOT NULL DEFAULT 'pending',
  error_message text,
  attempt integer NOT NULL DEFAULT 1,
  duration_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.group_join_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own join logs" ON public.group_join_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert join logs" ON public.group_join_logs
  FOR INSERT WITH CHECK (true);
