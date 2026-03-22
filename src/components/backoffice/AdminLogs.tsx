import { useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const actionLabels: Record<string, string> = {
  "update-client": "Atualização de dados",
  "update-subscription": "Alteração de plano",
  "reset-password": "Reset de senha",
  "force-logout": "Logout forçado",
  "toggle-status": "Alteração de status",
  "set-role": "Alteração de role",
  "create-device": "Criação de instância",
  "delete-device": "Remoção de instância",
};

const actionColors: Record<string, string> = {
  "update-client": "bg-teal-600/50 text-teal-200",
  "update-subscription": "bg-purple-600/50 text-purple-200",
  "reset-password": "bg-yellow-600/50 text-yellow-200",
  "force-logout": "bg-red-600/50 text-red-200",
  "toggle-status": "bg-orange-600/50 text-orange-200",
  "set-role": "bg-pink-600/50 text-pink-200",
  "create-device": "bg-green-600/50 text-green-200",
  "delete-device": "bg-red-600/50 text-red-200",
};

const AdminLogs = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-logs-global"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-data?action=admin-logs");
      if (error) throw error;
      return data?.logs || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  const logs = data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText size={20} className="text-purple-400" />
        <h3 className="text-lg font-semibold text-zinc-200">Auditoria Global</h3>
        <span className="text-sm text-zinc-400">({logs.length} registros)</span>
      </div>

      {logs.length === 0 ? (
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-8 text-center text-zinc-500">
          Nenhuma ação registrada
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto" style={{ contain: "layout style", willChange: "scroll-position", overscrollBehavior: "contain" }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-card text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Ação</th>
                  <th className="text-left px-4 py-3">Detalhes</th>
                  <th className="text-left px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] px-2 ${actionColors[log.action] || "bg-muted text-muted-foreground"}`}>
                        {actionLabels[log.action] || log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-foreground/80">{log.details}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLogs;
