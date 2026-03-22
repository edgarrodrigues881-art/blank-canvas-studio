import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Search, RefreshCw, MessageCircle, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const CommunityPoolTab = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["community-pool"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=community-pool-list");
      if (error) throw error;
      return data?.instances || [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ device_id, field, value, user_id }: any) => {
      const { error } = await supabase.functions.invoke("admin-data?action=community-pool-toggle", {
        body: { device_id, field, value, user_id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-pool"] });
      toast({ title: "Atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Only show accounts in community phase
  const communityAccounts = (data || []).filter((d: any) =>
    ["community_enabled", "community_light"].includes(d.cycle_phase)
  );

  const filtered = communityAccounts.filter((d: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name?.toLowerCase().includes(q) || d.number?.includes(q) || d.owner_name?.toLowerCase().includes(q) || d.owner_email?.toLowerCase().includes(q);
  });

  const conversando = filtered.filter((d: any) => d.is_enrolled).length;
  const pronto = filtered.filter((d: any) => d.is_eligible && !d.is_enrolled).length;

  const getChipStatus = (d: any) => {
    if (d.is_enrolled) return { label: "Conversando", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <MessageCircle size={12} /> };
    if (d.is_eligible) return { label: "Pronto", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <Clock size={12} /> };
    return { label: "Inativo", color: "bg-muted/50 text-muted-foreground border-border", icon: null };
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Users size={16} className="mx-auto text-primary mb-1" />
          <p className="text-lg font-bold text-foreground">{filtered.length}</p>
          <p className="text-[10px] text-muted-foreground">Na fase comunitária</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <MessageCircle size={16} className="mx-auto text-emerald-400 mb-1" />
          <p className="text-lg font-bold text-foreground">{conversando}</p>
          <p className="text-[10px] text-muted-foreground">Conversando</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <Clock size={16} className="mx-auto text-amber-400 mb-1" />
          <p className="text-lg font-bold text-foreground">{pronto}</p>
          <p className="text-[10px] text-muted-foreground">Pronto</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome, telefone ou usuário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 bg-card border-border text-xs h-8" />
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 px-2 shrink-0">
          <RefreshCw size={13} />
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground font-medium">{filtered.length} conta(s) na fase comunitária</p>

      {/* ═══ MOBILE: Card layout ═══ */}
      <div className="space-y-2 sm:hidden">
        {filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma conta na fase comunitária</p>
        ) : filtered.map((d: any) => {
          const chip = getChipStatus(d);
          return (
            <div key={d.id} className="bg-card border border-border rounded-xl p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{d.owner_name} · {d.number || "—"}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 gap-1 ${chip.color}`}>
                  {chip.icon}{chip.label}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <p className="text-muted-foreground/60 font-medium">Phase</p>
                  <p className="font-semibold text-foreground">{d.cycle_phase}</p>
                </div>
                <div>
                  <p className="text-muted-foreground/60 font-medium">Dia</p>
                  <p className="font-semibold text-foreground">{d.cycle_day_index}/{d.cycle_days_total}</p>
                </div>
                <div>
                  <p className="text-muted-foreground/60 font-medium">Conexão</p>
                  <p className="font-semibold text-foreground">{["connected", "ready"].includes(d.status?.toLowerCase()) ? "🟢" : "🔴"}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Ativo (conversando)</span>
                  <Switch
                    checked={d.is_enrolled}
                    onCheckedChange={(v) => toggleMutation.mutate({ device_id: d.id, field: "is_enrolled", value: v, user_id: d.user_id })}
                    className="scale-75"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Elegível</span>
                  <Switch
                    checked={d.is_eligible}
                    onCheckedChange={(v) => toggleMutation.mutate({ device_id: d.id, field: "is_eligible", value: v, user_id: d.user_id })}
                    className="scale-75"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ DESKTOP: Table layout ═══ */}
      <div className="border border-border rounded-lg overflow-hidden hidden sm:block">
        <div
          className="max-h-[calc(100vh-280px)] overflow-y-auto overflow-x-auto"
          style={{ contain: "layout style", willChange: "scroll-position", overscrollBehavior: "contain" }}
        >
          <table className="w-full text-sm min-w-[800px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/50 text-muted-foreground text-[10px] uppercase tracking-wider">
                <th className="text-left px-3 py-2.5">Usuário</th>
                <th className="text-left px-3 py-2.5">Instância</th>
                <th className="text-left px-3 py-2.5">Telefone</th>
                <th className="text-left px-3 py-2.5">Conexão</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="text-left px-3 py-2.5">Dia</th>
                <th className="text-center px-3 py-2.5">Ativo</th>
                <th className="text-center px-3 py-2.5">Elegível</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Nenhuma conta na fase comunitária</td></tr>
              ) : filtered.map((d: any) => {
                const chip = getChipStatus(d);
                return (
                  <tr key={d.id} className="hover:bg-muted/30 transition-colors text-xs">
                    <td className="px-3 py-2.5">
                      <div className="truncate max-w-[150px] font-medium text-foreground">{d.owner_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{d.owner_email}</div>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{d.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{d.number || "—"}</td>
                    <td className="px-3 py-2.5">
                      {["connected", "ready"].includes(d.status?.toLowerCase())
                        ? <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Online</Badge>
                        : <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30">Offline</Badge>
                      }
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${chip.color}`}>
                        {chip.icon}{chip.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">{d.cycle_day_index}/{d.cycle_days_total}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Switch
                        checked={d.is_enrolled}
                        onCheckedChange={(v) => toggleMutation.mutate({ device_id: d.id, field: "is_enrolled", value: v, user_id: d.user_id })}
                        className="scale-75"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Switch
                        checked={d.is_eligible}
                        onCheckedChange={(v) => toggleMutation.mutate({ device_id: d.id, field: "is_eligible", value: v, user_id: d.user_id })}
                        className="scale-75"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CommunityPoolTab;
