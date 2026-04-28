
-- ============== NOTEBOOKS ==============
CREATE TABLE public.note_books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Novo caderno',
  icon TEXT NOT NULL DEFAULT 'notebook',
  color TEXT NOT NULL DEFAULT 'emerald',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.note_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_notebooks" ON public.note_books FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_notebooks" ON public.note_books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_notebooks" ON public.note_books FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_notebooks" ON public.note_books FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_note_books_user ON public.note_books(user_id, position);
CREATE TRIGGER trg_note_books_updated_at BEFORE UPDATE ON public.note_books
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== COLUMNS ==============
CREATE TABLE public.note_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notebook_id UUID NOT NULL REFERENCES public.note_books(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Nova coluna',
  color TEXT NOT NULL DEFAULT 'slate',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.note_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_note_columns" ON public.note_columns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_note_columns" ON public.note_columns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_note_columns" ON public.note_columns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_note_columns" ON public.note_columns FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_note_columns_notebook ON public.note_columns(notebook_id, position);
CREATE TRIGGER trg_note_columns_updated_at BEFORE UPDATE ON public.note_columns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== BLOCKS (notes) ==============
CREATE TABLE public.note_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notebook_id UUID NOT NULL REFERENCES public.note_books(id) ON DELETE CASCADE,
  column_id UUID REFERENCES public.note_columns(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT,                       -- rich text / markdown
  image_url TEXT,
  link_url TEXT,
  price NUMERIC(14,2),                -- valor opcional somado por coluna
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id,text,done}]
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  goals JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{label,target,current,unit}]
  color TEXT,                         -- accent override
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.note_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_note_blocks" ON public.note_blocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_note_blocks" ON public.note_blocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_note_blocks" ON public.note_blocks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_note_blocks" ON public.note_blocks FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_note_blocks_notebook ON public.note_blocks(notebook_id, column_id, position);
CREATE INDEX idx_note_blocks_user ON public.note_blocks(user_id);
CREATE TRIGGER trg_note_blocks_updated_at BEFORE UPDATE ON public.note_blocks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== STORAGE POLICIES ==============
-- Reuse existing 'media' public bucket; uploads will be prefixed with userId/notes/
CREATE POLICY "Users upload own note images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] = 'notes'
  );
