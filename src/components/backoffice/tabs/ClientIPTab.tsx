import { useState, useMemo } from "react";
import { Globe, AlertTriangle, Copy, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  detail: any;
}

const ClientIPTab = ({ detail }: Props) => {
  const [search, setSearch] = useState("");
  const loginHistory: any[] = detail?.login_history || [];
  const signupIp: string | null = detail?.profile?.signup_ip || null;
  const ipDuplicates: Record<string, { count: number; user_ids: string[] }> = detail?.ip_duplicates || {};

  // Unique IPs
  const uniqueIps = useMemo(() => {
    const seen = new Set<string>();
    return loginHistory.filter(e => {
      if (seen.has(e.ip_address)) return false;
      seen.add(e.ip_address);
      return true;
    });
  }, [loginHistory]);

  // Count per IP (within this user)
  const ipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of loginHistory) {
      counts[entry.ip_address] = (counts[entry.ip_address] || 0) + 1;
    }
    return counts;
  }, [loginHistory]);

  const filtered = useMemo(() => {
    if (!search) return loginHistory;
    const q = search.toLowerCase();
    return loginHistory.filter(e => e.ip_address.includes(q));
  }, [loginHistory, search]);

  const copyIp = (ip: string) => {
    navigator.clipboard.writeText(ip);
    toast.success("IP copiado!");
  };

  const isDuplicate = (ip: string) => !!ipDuplicates[ip];
  const duplicateCount = (ip: string) => ipDuplicates[ip]?.count || 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Globe size={18} className="text-primary" />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Histórico de IPs</h3>
          <p className="text-xs text-muted-foreground">
            {loginHistory.length} login{loginHistory.length !== 1 ? "s" : ""} · {uniqueIps.length} IP{uniqueIps.length !== 1 ? "s" : ""} único{uniqueIps.length !== 1 ? "s" : ""}
            {Object.keys(ipDuplicates).length > 0 && (
              <span className="text-red-400 font-semibold ml-2">
                ⚠ {Object.keys(ipDuplicates).length} IP{Object.keys(ipDuplicates).length !== 1 ? "s" : ""} compartilhado{Object.keys(ipDuplicates).length !== 1 ? "s" : ""} com outras contas
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Signup IP */}
      {signupIp && (
        <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
            <Globe size={13} className="text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-sky-400">IP de cadastro</span>
            <p className="text-sm text-foreground font-mono">{signupIp}</p>
          </div>
          <button onClick={() => copyIp(signupIp)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <Copy size={13} className="text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          placeholder="Buscar IP..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-8 text-sm bg-card/50 border-border/60"
        />
      </div>

      {/* IP Summary Cards */}
      {uniqueIps.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {uniqueIps.map(entry => {
            const count = ipCounts[entry.ip_address];
            const dup = isDuplicate(entry.ip_address);
            const dupCount = duplicateCount(entry.ip_address);
            return (
              <div
                key={entry.ip_address}
                className={`bg-card border rounded-xl px-3 py-2.5 cursor-pointer hover:border-primary/20 transition-all ${
                  dup ? "border-red-500/40 bg-red-500/5" : "border-border"
                }`}
                onClick={() => copyIp(entry.ip_address)}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`text-xs font-mono truncate ${dup ? "text-red-400 font-bold" : "text-foreground"}`}>
                    {entry.ip_address}
                  </span>
                  {dup && <AlertTriangle size={11} className="text-red-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {count} acesso{count !== 1 ? "s" : ""}
                  </span>
                  {dup && (
                    <span className="text-[10px] text-red-400 font-semibold flex items-center gap-0.5">
                      <Users size={9} /> {dupCount} contas
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full History */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Globe size={32} className="mb-2 opacity-20" />
          <p className="text-sm">Nenhum login registrado</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((entry: any, idx: number) => {
            const time = new Date(entry.logged_in_at).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "2-digit",
              hour: "2-digit", minute: "2-digit",
            });
            const dup = isDuplicate(entry.ip_address);
            const dupCount = duplicateCount(entry.ip_address);

            return (
              <div
                key={entry.id || idx}
                className={`flex items-center gap-3 bg-card border rounded-xl px-4 py-2.5 hover:border-primary/15 transition-all ${
                  dup ? "border-red-500/30 bg-red-500/5" : "border-border"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  dup ? "bg-red-500/10" : "bg-primary/10"
                }`}>
                  <Globe size={13} className={dup ? "text-red-400" : "text-primary"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${dup ? "text-red-400 font-bold" : "text-foreground"}`}>
                      {entry.ip_address}
                    </span>
                    {dup && (
                      <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 px-1.5 py-0">
                        {dupCount} contas
                      </Badge>
                    )}
                  </div>
                  {entry.user_agent && (
                    <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">{entry.user_agent}</p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">{time}</span>
                <button onClick={(e) => { e.stopPropagation(); copyIp(entry.ip_address); }} className="p-1 rounded hover:bg-muted transition-colors">
                  <Copy size={11} className="text-muted-foreground/40" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ClientIPTab;
