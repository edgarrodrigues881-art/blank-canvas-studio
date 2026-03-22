import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, AlertTriangle, Check, X, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PoolGroup {
  id: string;
  name: string;
  external_group_ref: string;
  is_active: boolean;
  created_at: string;
}

const AdminGroupsPool = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newRef, setNewRef] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRef, setEditRef] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["admin-groups-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_groups_pool")
        .select("id, name, external_group_ref, is_active, created_at, updated_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as PoolGroup[];
    },
  });

  const activeCount = groups.filter(g => g.is_active).length;

  const addGroup = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      // Use admin-data edge function for admin operations
      const { error } = await supabase.functions.invoke("admin-data?action=groups-pool-add", {
        body: { name: newName, external_group_ref: newRef },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-groups-pool"] });
      setNewName("");
      setNewRef("");
      toast({ title: "Grupo adicionado ao pool" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.functions.invoke("admin-data?action=groups-pool-toggle", {
        body: { group_id: id, is_active },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-groups-pool"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, name, external_group_ref }: { id: string; name: string; external_group_ref: string }) => {
      const { error } = await supabase.functions.invoke("admin-data?action=groups-pool-update", {
        body: { group_id: id, name, external_group_ref },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-groups-pool"] });
      setEditingId(null);
      toast({ title: "Grupo atualizado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke("admin-data?action=groups-pool-delete", {
        body: { group_id: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-groups-pool"] });
      toast({ title: "Grupo removido" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const startEdit = (g: PoolGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditRef(g.external_group_ref);
  };

  return (
    <div className="space-y-4">

      {/* Add new group */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Adicionar Grupo</p>
        <div className="flex gap-2">
          <Input
            placeholder="Nome do grupo"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="bg-background text-sm"
          />
          <Input
            placeholder="Ref externa (JID/link)"
            value={newRef}
            onChange={e => setNewRef(e.target.value)}
            className="bg-background text-sm"
          />
          <Button
            size="sm"
            onClick={() => addGroup.mutate()}
            disabled={!newName.trim() || addGroup.isPending}
          >
            <Plus size={14} className="mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Groups list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grupo De Aquecimento ({groups.length})</p>
          <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-groups-pool"] })}>
            <RefreshCw size={12} className="mr-1" /> Atualizar
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : groups.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum grupo no pool</div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((g, idx) => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <span className="text-xs text-muted-foreground/50 font-mono w-5">{idx + 1}</span>
                
                {editingId === g.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                    <Input
                      value={editRef}
                      onChange={e => setEditRef(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                    <Button size="sm" variant="ghost" onClick={() => updateGroup.mutate({ id: g.id, name: editName, external_group_ref: editRef })}>
                      <Check size={14} className="text-emerald-400" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X size={14} />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{g.external_group_ref || "—"}</p>
                    </div>
                    <Badge variant={g.is_active ? "default" : "secondary"} className="text-[10px]">
                      {g.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                    <Switch
                      checked={g.is_active}
                      onCheckedChange={(checked) => toggleActive.mutate({ id: g.id, is_active: checked })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => startEdit(g)}>
                      <Pencil size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTargetId(g.id)}>
                      <Trash2 size={12} className="text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover grupo do pool?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O grupo será removido permanentemente do pool de aquecimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTargetId) deleteGroup.mutate(deleteTargetId);
                setDeleteTargetId(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminGroupsPool;
