import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface Notebook {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  position: number;
}

export interface NoteColumn {
  id: string;
  user_id: string;
  notebook_id: string;
  label: string;
  color: string;
  position: number;
}

export interface ChecklistItem { id: string; text: string; done: boolean }
export interface GoalRow { label: string; target: number; current: number; unit?: string }

export interface NoteBlock {
  id: string;
  user_id: string;
  notebook_id: string;
  column_id: string | null;
  title: string;
  content: string | null;
  image_url: string | null;
  link_url: string | null;
  price: number | null;
  checklist: ChecklistItem[];
  tags: string[];
  goals: GoalRow[];
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export function useNotes() {
  const { user } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [columns, setColumns] = useState<NoteColumn[]>([]);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [nb, cols, bls] = await Promise.all([
      supabase.from("note_books").select("*").order("position", { ascending: true }),
      supabase.from("note_columns").select("*").order("position", { ascending: true }),
      supabase.from("note_blocks").select("*").order("position", { ascending: true }),
    ]);
    setNotebooks((nb.data as any) || []);
    setColumns((cols.data as any) || []);
    setBlocks(((bls.data as any) || []).map((b: any) => ({
      ...b,
      checklist: Array.isArray(b.checklist) ? b.checklist : [],
      tags: Array.isArray(b.tags) ? b.tags : [],
      goals: Array.isArray(b.goals) ? b.goals : [],
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-select first notebook
  useEffect(() => {
    if (!activeNotebookId && notebooks.length > 0) {
      setActiveNotebookId(notebooks[0].id);
    }
  }, [notebooks, activeNotebookId]);

  // ============== NOTEBOOK ==============
  const createNotebook = async (name = "Novo caderno") => {
    if (!user) return null;
    const pos = notebooks.length;
    const { data, error } = await supabase.from("note_books").insert({
      user_id: user.id, name, position: pos,
    }).select().single();
    if (error) throw error;
    // create 3 default columns
    const baseCols = [
      { label: "Ideias", color: "blue", position: 0 },
      { label: "Em andamento", color: "amber", position: 1 },
      { label: "Concluído", color: "emerald", position: 2 },
    ];
    await supabase.from("note_columns").insert(baseCols.map(c => ({
      user_id: user.id, notebook_id: data.id, ...c,
    })));
    await fetchAll();
    setActiveNotebookId(data.id);
    return data as Notebook;
  };

  const updateNotebook = async (id: string, patch: Partial<Notebook>) => {
    setNotebooks(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
    await supabase.from("note_books").update(patch).eq("id", id);
  };

  const deleteNotebook = async (id: string) => {
    setNotebooks(prev => prev.filter(n => n.id !== id));
    await supabase.from("note_books").delete().eq("id", id);
    if (activeNotebookId === id) setActiveNotebookId(null);
    await fetchAll();
  };

  // ============== COLUMNS ==============
  const createColumn = async (notebookId: string, label = "Nova coluna") => {
    if (!user) return;
    const cols = columns.filter(c => c.notebook_id === notebookId);
    const { data } = await supabase.from("note_columns").insert({
      user_id: user.id, notebook_id: notebookId, label, position: cols.length,
    }).select().single();
    if (data) setColumns(prev => [...prev, data as any]);
  };

  const updateColumn = async (id: string, patch: Partial<NoteColumn>) => {
    setColumns(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    await supabase.from("note_columns").update(patch).eq("id", id);
  };

  const deleteColumn = async (id: string) => {
    setColumns(prev => prev.filter(c => c.id !== id));
    setBlocks(prev => prev.map(b => b.column_id === id ? { ...b, column_id: null } : b));
    await supabase.from("note_columns").delete().eq("id", id);
  };

  // ============== BLOCKS ==============
  const createBlock = async (notebookId: string, columnId: string | null) => {
    if (!user) return null;
    const inCol = blocks.filter(b => b.column_id === columnId);
    const { data, error } = await supabase.from("note_blocks").insert({
      user_id: user.id, notebook_id: notebookId, column_id: columnId,
      title: "Nova anotação", position: inCol.length,
    }).select().single();
    if (error) throw error;
    const block = { ...(data as any), checklist: [], tags: [], goals: [] } as NoteBlock;
    setBlocks(prev => [...prev, block]);
    return block;
  };

  const updateBlock = async (id: string, patch: Partial<NoteBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } as NoteBlock : b));
    await supabase.from("note_blocks").update(patch as any).eq("id", id);
  };

  const deleteBlock = async (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    await supabase.from("note_blocks").delete().eq("id", id);
  };

  const moveBlock = async (id: string, toColumnId: string | null, toIndex: number) => {
    const moving = blocks.find(b => b.id === id);
    if (!moving) return;
    const target = blocks.filter(b => b.column_id === toColumnId && b.id !== id);
    target.splice(toIndex, 0, { ...moving, column_id: toColumnId });
    const updates = target.map((b, idx) => ({ ...b, position: idx }));
    setBlocks(prev => prev.map(b => {
      const u = updates.find(x => x.id === b.id);
      return u ? { ...b, ...u } : b;
    }));
    await supabase.from("note_blocks").update({ column_id: toColumnId, position: toIndex }).eq("id", id);
    // best effort reorder others
    await Promise.all(updates.filter(u => u.id !== id).map(u =>
      supabase.from("note_blocks").update({ position: u.position }).eq("id", u.id)
    ));
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/notes/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
    if (error) { console.error(error); return null; }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  };

  return {
    loading, notebooks, columns, blocks,
    activeNotebookId, setActiveNotebookId,
    createNotebook, updateNotebook, deleteNotebook,
    createColumn, updateColumn, deleteColumn,
    createBlock, updateBlock, deleteBlock, moveBlock,
    uploadImage, refresh: fetchAll,
  };
}
