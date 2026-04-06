
CREATE TABLE public.ai_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  ia_active BOOLEAN NOT NULL DEFAULT false,
  api_key TEXT DEFAULT '',
  ai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  tone TEXT NOT NULL DEFAULT 'professional',
  response_style TEXT NOT NULL DEFAULT 'medium',
  ai_instructions TEXT DEFAULT '',
  business_name TEXT DEFAULT '',
  business_type TEXT DEFAULT '',
  business_hours TEXT DEFAULT '',
  business_segment TEXT DEFAULT '',
  business_description TEXT DEFAULT '',
  fallback_image TEXT DEFAULT 'Não consigo ver imagens, pode descrever por texto?',
  fallback_audio TEXT DEFAULT 'Não consigo ouvir áudios, pode escrever?',
  pause_words TEXT DEFAULT 'parar, atendente, humano',
  reactivate_words TEXT DEFAULT 'voltar, continuar',
  auto_transfer_human BOOLEAN NOT NULL DEFAULT false,
  simulate_typing BOOLEAN NOT NULL DEFAULT true,
  split_long_messages BOOLEAN NOT NULL DEFAULT true,
  conversation_memory BOOLEAN NOT NULL DEFAULT true,
  min_delay_seconds INTEGER NOT NULL DEFAULT 1,
  max_delay_seconds INTEGER NOT NULL DEFAULT 3,
  block_sensitive BOOLEAN NOT NULL DEFAULT true,
  require_human_for_sale BOOLEAN NOT NULL DEFAULT true,
  creativity INTEGER NOT NULL DEFAULT 50,
  max_response_length TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI settings"
  ON public.ai_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI settings"
  ON public.ai_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI settings"
  ON public.ai_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
