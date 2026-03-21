
-- Announcements table
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  show_logo boolean NOT NULL DEFAULT true,
  button_text text NOT NULL DEFAULT 'Entendi',
  button_link text,
  button_action text NOT NULL DEFAULT 'close',
  is_active boolean NOT NULL DEFAULT false,
  display_mode text NOT NULL DEFAULT 'once',
  start_date timestamptz,
  end_date timestamptz,
  allow_close boolean NOT NULL DEFAULT true,
  allow_dismiss boolean NOT NULL DEFAULT true,
  internal_name text NOT NULL DEFAULT 'Novo Aviso',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view active announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Dismissals table to track "don't show again"
CREATE TABLE public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, announcement_id)
);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dismissals" ON public.announcement_dismissals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dismissals" ON public.announcement_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dismissals" ON public.announcement_dismissals
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
