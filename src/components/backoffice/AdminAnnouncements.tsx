import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus, Pencil, Trash2, Eye, ToggleLeft, ToggleRight,
  Megaphone, Loader2, AlertCircle, Calendar, Clock,
  ExternalLink, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AnnouncementPopup } from "@/components/AnnouncementPopup";

interface Announcement {
  id: string;
  admin_id: string;
  internal_name: string;
  title: string;
  description: string;
  image_url: string | null;
  show_logo: boolean;
  button_text: string;
  button_link: string | null;
  button_action: string;
  is_active: boolean;
  display_mode: string;
  start_date: string | null;
  end_date: string | null;
  allow_close: boolean;
  allow_dismiss: boolean;
  created_at: string;
  updated_at: string;
}

const defaultForm: Omit<Announcement, "id" | "admin_id" | "created_at" | "updated_at"> = {
  internal_name: "",
  title: "",
  description: "",
  image_url: null,
  show_logo: true,
  button_text: "Entendi",
  button_link: null,
  button_action: "close",
  is_active: false,
  display_mode: "once",
  start_date: null,
  end_date: null,
  allow_close: true,
  allow_dismiss: true,
};

export default function AdminAnnouncements() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFromEditor, setPreviewFromEditor] = useState(false);
  const [previewData, setPreviewData] = useState<typeof defaultForm | null>(null);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Announcement[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { id?: string; data: any }) => {
      if (payload.id) {
        const { error } = await (supabase.from("announcements" as any).update(payload.data) as any).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("announcements" as any).insert(payload.data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      toast.success(editing ? "Aviso atualizado!" : "Aviso criado!");
      closeForm();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("announcements" as any).delete() as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      toast.success("Aviso excluído");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase.from("announcements" as any).update({ is_active: active, updated_at: new Date().toISOString() }) as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-announcements"] });
      toast.success("Status atualizado");
    },
  });

  const openCreate = () => {
    setForm({ ...defaultForm });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (a: Announcement) => {
    setForm({
      internal_name: a.internal_name,
      title: a.title,
      description: a.description,
      image_url: a.image_url,
      show_logo: a.show_logo,
      button_text: a.button_text,
      button_link: a.button_link,
      button_action: a.button_action,
      is_active: a.is_active,
      display_mode: a.display_mode,
      start_date: a.start_date,
      end_date: a.end_date,
      allow_close: a.allow_close,
      allow_dismiss: a.allow_dismiss,
    });
    setEditing(a);
    setCreating(true);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setForm({ ...defaultForm });
  };

  const handleSave = () => {
    if (!form.internal_name.trim() || !form.title.trim()) {
      toast.error("Nome interno e título são obrigatórios");
      return;
    }
    const payload = {
      ...form,
      admin_id: user?.id,
      updated_at: new Date().toISOString(),
    };
    saveMutation.mutate({ id: editing?.id, data: payload });
  };

  const openPreview = (data: typeof defaultForm, fromEditor = false) => {
    setPreviewData(data);
    setPreviewFromEditor(fromEditor);
    setPreviewOpen(true);
    if (fromEditor) setCreating(false);
  };

  const displayModeLabels: Record<string, string> = {
    once: "Uma vez",
    always: "Sempre",
    date_range: "Período",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // Empty state
  if (announcements.length === 0 && !creating) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="rounded-full bg-primary/10 p-5">
          <Megaphone className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center max-w-md space-y-2">
          <h3 className="text-xl font-bold text-foreground">Nenhum aviso criado</h3>
          <p className="text-sm text-muted-foreground">
            Crie avisos para exibir atualizações, comunicados e alertas importantes para seus usuários em formato de popup premium.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus size={16} /> Criar primeiro aviso
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Avisos</h2>
          <p className="text-sm text-muted-foreground">Gerencie avisos e comunicados para seus usuários</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus size={16} /> Novo Aviso
        </Button>
      </div>

      {/* Listing */}
      <div className="space-y-3">
        {announcements.map((a) => (
          <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 transition-colors">
            {/* Icon */}
            <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${a.is_active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              <Megaphone size={18} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-foreground text-sm truncate">{a.internal_name}</h4>
                <Badge variant={a.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {a.is_active ? "Ativo" : "Inativo"}
                </Badge>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {displayModeLabels[a.display_mode] || a.display_mode}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{a.title}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {format(new Date(a.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost" size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-foreground"
                onClick={() => openPreview({
                  internal_name: a.internal_name, title: a.title, description: a.description,
                  image_url: a.image_url, show_logo: a.show_logo, button_text: a.button_text,
                  button_link: a.button_link, button_action: a.button_action, is_active: a.is_active,
                  display_mode: a.display_mode, start_date: a.start_date, end_date: a.end_date,
                  allow_close: a.allow_close, allow_dismiss: a.allow_dismiss,
                })}
              >
                <Eye size={15} />
              </Button>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(a)}>
                <Pencil size={15} />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-foreground"
                onClick={() => toggleMutation.mutate({ id: a.id, active: !a.is_active })}
              >
                {a.is_active ? <ToggleRight size={15} className="text-primary" /> : <ToggleLeft size={15} />}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive">
                    <Trash2 size={15} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir aviso?</AlertDialogTitle>
                    <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-border">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMutation.mutate(a.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={creating} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Aviso" : "Novo Aviso"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Content Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Megaphone size={14} className="text-primary" /> Conteúdo
              </h4>

              <div className="space-y-2">
                <Label className="text-xs">Nome interno</Label>
                <Input
                  value={form.internal_name}
                  onChange={(e) => setForm(f => ({ ...f, internal_name: e.target.value }))}
                  placeholder="Ex: Atualização v2.5"
                  className="bg-background border-border"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Título do popup</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Nova atualização disponível"
                  className="bg-background border-border"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Descrição / Copy</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Texto principal do aviso..."
                  rows={4}
                  className="bg-background border-border resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">URL da imagem (opcional)</Label>
                <Input
                  value={form.image_url || ""}
                  onChange={(e) => setForm(f => ({ ...f, image_url: e.target.value || null }))}
                  placeholder="https://..."
                  className="bg-background border-border"
                />
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={form.show_logo}
                  onCheckedChange={(v) => setForm(f => ({ ...f, show_logo: v }))}
                />
                <Label className="text-xs">Mostrar logo no topo</Label>
              </div>
            </div>

            {/* Button Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ExternalLink size={14} className="text-primary" /> Botão
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Texto do botão</Label>
                  <Input
                    value={form.button_text}
                    onChange={(e) => setForm(f => ({ ...f, button_text: e.target.value }))}
                    placeholder="Entendi"
                    className="bg-background border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Ação do botão</Label>
                  <Select value={form.button_action} onValueChange={(v) => setForm(f => ({ ...f, button_action: v }))}>
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="close">Fechar popup</SelectItem>
                      <SelectItem value="link">Abrir link externo</SelectItem>
                      <SelectItem value="route">Ir para rota interna</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.button_action !== "close" && (
                <div className="space-y-2">
                  <Label className="text-xs">{form.button_action === "link" ? "URL do link" : "Rota interna"}</Label>
                  <Input
                    value={form.button_link || ""}
                    onChange={(e) => setForm(f => ({ ...f, button_link: e.target.value || null }))}
                    placeholder={form.button_action === "link" ? "https://..." : "/dashboard/..."}
                    className="bg-background border-border"
                  />
                </div>
              )}
            </div>

            {/* Display Section */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar size={14} className="text-primary" /> Exibição
              </h4>

              <div className="flex items-center gap-3">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))}
                />
                <Label className="text-xs">Ativar aviso</Label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Modo de exibição</Label>
                <Select value={form.display_mode} onValueChange={(v) => setForm(f => ({ ...f, display_mode: v }))}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once">Mostrar uma vez por usuário</SelectItem>
                    <SelectItem value="always">Mostrar sempre ao entrar</SelectItem>
                    <SelectItem value="date_range">Mostrar entre datas específicas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.display_mode === "date_range" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Data inicial</Label>
                    <Input
                      type="datetime-local"
                      value={form.start_date?.slice(0, 16) || ""}
                      onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                      className="bg-background border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Data final</Label>
                    <Input
                      type="datetime-local"
                      value={form.end_date?.slice(0, 16) || ""}
                      onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                      className="bg-background border-border"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.allow_close}
                    onCheckedChange={(v) => setForm(f => ({ ...f, allow_close: v }))}
                  />
                  <Label className="text-xs">Permitir fechar</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.allow_dismiss}
                    onCheckedChange={(v) => setForm(f => ({ ...f, allow_dismiss: v }))}
                  />
                  <Label className="text-xs">Opção "não mostrar novamente"</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => openPreview(form, true)} className="border-border gap-1.5">
              <Eye size={14} /> Preview
            </Button>
            <Button variant="outline" onClick={closeForm} className="border-border">Cancelar</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
              {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              {editing ? "Salvar" : "Criar Aviso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal — rendered via portal to escape Dialog focus trap */}
      {previewOpen && previewData && createPortal(
        <AnnouncementPopup
          announcement={{
            id: "preview",
            title: previewData.title || "Título do aviso",
            description: previewData.description || "Descrição do aviso...",
            image_url: previewData.image_url || null,
            show_logo: previewData.show_logo,
            button_text: previewData.button_text || "Entendi",
            button_link: previewData.button_link || null,
            button_action: previewData.button_action || "close",
            allow_close: true,
            allow_dismiss: false,
          }}
          onClose={() => {
            setPreviewOpen(false);
            if (previewFromEditor) setCreating(true);
          }}
          onDismiss={() => {
            setPreviewOpen(false);
            if (previewFromEditor) setCreating(true);
          }}
          isPreview
        />,
        document.body
      )}
    </div>
  );
}
