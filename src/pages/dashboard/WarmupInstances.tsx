import { useState, useMemo, useRef, useEffect, memo, useCallback } from "react";
import VirtualizedDeviceGrid from "@/components/warmup/VirtualizedDeviceGrid";
import dgLogoNew from "@/assets/dg-logo-new.png";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWarmupCycles } from "@/hooks/useWarmupV2";
import { useWarmupEngine } from "@/hooks/useWarmupEngine";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWarmupFolders } from "@/hooks/useWarmupFolders";
import { TagManagerDialog, type FolderTag } from "@/components/warmup/TagManagerDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Flame, Wifi, WifiOff, AlertTriangle, Loader2,
  Phone, Search, Filter, Pause, Play, Pencil, X,
  QrCode, Key, Shield, Ban, CheckCircle2, XCircle,
  Smartphone, RefreshCw, Lock, Target, Timer, Zap,
  FolderOpen, Tag, Users, ArrowLeft, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Add to Folder Dialog ── */
const AddToFolderDialog = memo(({ open, onOpenChange, allDevices, currentDeviceIds, folderName, folderColor, onSave, cycleByDeviceId }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allDevices: any[];
  currentDeviceIds: string[];
  folderName: string;
  folderColor: string;
  onSave: (deviceIds: string[]) => Promise<void>;
  cycleByDeviceId: Map<string, any>;
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(currentDeviceIds));
      setSearchTerm("");
    }
  }, [open, currentDeviceIds]);

  const filtered = useMemo(() => {
    if (!searchTerm) return allDevices;
    const q = searchTerm.toLowerCase();
    return allDevices.filter(d => d.name.toLowerCase().includes(q) || (d.number || "").includes(q));
  }, [allDevices, searchTerm]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(Array.from(selected));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <FolderOpen className="w-4 h-4" style={{ color: folderColor }} />
            Adicionar a "{folderName}"
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          {allDevices.length > 5 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
              <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar instância..." className="h-8 pl-8 text-xs" />
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              {selected.size} selecionada(s)
            </span>
            <button
              className="text-[10px] text-primary hover:text-primary/80 font-bold"
              onClick={() => setSelected(prev => prev.size === allDevices.length ? new Set() : new Set(allDevices.map(d => d.id)))}
            >
              {selected.size > 0 ? "Desmarcar" : "Selecionar todos"}
            </button>
          </div>
          <div className="overflow-y-auto flex-1 space-y-1 rounded-xl border border-border/15 bg-muted/10 p-2 scrollbar-thin max-h-[300px]">
            {filtered.map((d) => {
              const isSelected = selected.has(d.id);
              const cycle = cycleByDeviceId.get(d.id);
              const phase = cycle?.phase;
              return (
                <button
                  key={d.id}
                  onClick={() => toggle(d.id)}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors",
                    isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/30 border border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                    isSelected ? "bg-primary border-primary" : "border-border/40"
                  )}>
                    {isSelected && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-foreground truncate">{d.name}</p>
                    <div className="flex items-center gap-2">
                      {d.number && <span className="text-[10px] text-muted-foreground/50 font-mono">{d.number}</span>}
                      {phase && <span className="text-[9px] text-muted-foreground/40">{phaseShort[phase] || phase}</span>}
                    </div>
                  </div>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    CONNECTED_STATUSES.includes(d.status) ? "bg-primary" : "bg-muted-foreground/30"
                  )} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2 pt-3 border-t border-border/10">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 h-9">
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 h-9">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});


const phaseLabels: Record<string, string> = {
  pre_24h: "Primeiras 24h",
  groups_only: "Grupos",
  completed: "Concluído",
  paused: "Pausado",
  error: "Erro",
  autosave_enabled: "Auto Save",
  community_enabled: "Comunidade",
  community_light: "Comunidade Light",
};

const phaseShort: Record<string, string> = {
  pre_24h: "iniciante",
  groups_only: "grupos",
  completed: "concluído",
  paused: "pausado",
  error: "erro",
  autosave_enabled: "auto save",
  community_enabled: "comunidade",
  community_light: "comunidade",
};

const CONNECTED_STATUSES = ["Connected", "Ready", "authenticated"];

const getWarmupProgress = (cycle?: {
  daily_interaction_budget_target?: number;
  daily_interaction_budget_used?: number;
  phase?: string;
} | null) => {
  if (!cycle) return null;
  if (cycle.phase === "completed") return 100;
  const target = Math.max(cycle.daily_interaction_budget_target ?? 0, 1);
  const used = Math.max(cycle.daily_interaction_budget_used ?? 0, 0);
  return Math.min(100, Math.round((used / target) * 100));
};

const DeviceCard = memo(({ device, cycle, onPause, onResume, onCancel, onConnect, onNavigate, formatPhone, deviceTags, availableTags, onTagClick, onRemoveFromFolder }: {
  device: any;
  cycle: any;
  onPause: (id: string, e: React.MouseEvent) => void;
  onResume: (id: string, e: React.MouseEvent) => void;
  onCancel: (id: string) => void;
  onConnect: (device: any) => void;
  onNavigate: (path: string) => void;
  formatPhone: (num: string) => string;
  deviceTags?: FolderTag[];
  availableTags?: FolderTag[];
  onTagClick?: (deviceId: string) => void;
  onRemoveFromFolder?: (deviceId: string) => void;
}) => {
  const connected = CONNECTED_STATUSES.includes(device.status);
  const isWarming = cycle && cycle.is_running && cycle.phase !== "completed";
  const warmupProgress = getWarmupProgress(cycle);

  // Disconnect elapsed timer — update every 60s instead of 1s to reduce re-renders
  const [countdown, setCountdown] = useState(() => {
    if (connected) return "";
    const disconnectSince = device.updated_at ?? device.created_at;
    if (!disconnectSince) return "";
    const elapsed = Date.now() - new Date(disconnectSince).getTime();
    if (elapsed < 0 || Number.isNaN(elapsed)) return "";
    const totalMin = Math.floor(elapsed / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
  useEffect(() => {
    if (connected) { setCountdown(""); return; }
    const disconnectSince = device.updated_at ?? device.created_at;
    if (!disconnectSince) return;
    const disconnectedAt = new Date(disconnectSince).getTime();
    if (Number.isNaN(disconnectedAt)) return;

    const calc = () => {
      const elapsed = Date.now() - disconnectedAt;
      if (elapsed < 0) { setCountdown("00:00"); return; }
      const totalMin = Math.floor(elapsed / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    };

    calc();
    const interval = setInterval(calc, 60_000); // every 60s instead of 1s
    return () => clearInterval(interval);
  }, [connected, device.updated_at, device.created_at]);

  return (
    <div
      className={cn(
        "group relative rounded-2xl border overflow-hidden cursor-pointer transition-colors duration-100",
        "bg-card shadow-sm",
        connected
          ? "border-primary/15 hover:border-primary/30"
          : "border-border/30 hover:border-border/50"
      )}
      onClick={() => onNavigate(`/dashboard/warmup-v2/${device.id}`)}
    >
      <div className={cn(
        "h-[2px] w-full",
        isWarming ? "bg-primary/60" : connected ? "bg-primary/25" : "bg-border/30"
      )} />

      <div className="px-3 sm:px-4 pt-3 sm:pt-3.5 flex flex-wrap items-start justify-between gap-1">
        <div className={cn(
          "inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[9px] font-bold uppercase tracking-widest shrink-0",
          connected ? "text-primary bg-primary/8" : "text-muted-foreground bg-muted/30"
        )}>
          <span className={cn(
            "w-[5px] h-[5px] rounded-full shrink-0",
            connected ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" : "bg-muted-foreground/40"
          )} />
          {connected ? "CONECTADO" : "DESCONECTADO"}
        </div>
        <div className="flex flex-col items-end gap-1 shrink min-w-0 max-w-[60%]">
          {cycle && warmupProgress !== null && (
            <div className="relative flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-0.5 sm:py-1 bg-[#1a1a1a] border border-orange-500/20 overflow-hidden">
              <div
                className="absolute inset-0 rounded-lg transition-all duration-700 ease-out"
                style={{
                  background: `linear-gradient(90deg, hsl(25 95% 53% / 0.18) 0%, hsl(25 95% 53% / 0.08) ${warmupProgress}%, transparent ${warmupProgress}%)`,
                }}
              />
              <Flame className="w-3 h-3 text-orange-400 relative z-10 shrink-0" />
              <span className="text-[10px] sm:text-[11px] font-bold text-orange-300 relative z-10 tabular-nums shrink-0">
                {warmupProgress}%
              </span>
              <span className={cn(
                "relative z-10 text-[7px] font-extrabold uppercase tracking-wider px-1.5 py-[2px] rounded shrink min-w-0 truncate",
                cycle.phase === "pre_24h" && "bg-sky-500/20 text-sky-300",
                cycle.phase === "groups_only" && "bg-emerald-500/20 text-emerald-300",
                cycle.phase === "autosave_enabled" && "bg-violet-500/20 text-violet-300",
                cycle.phase === "community_enabled" && "bg-amber-500/20 text-amber-300",
                cycle.phase === "paused" && "bg-muted/30 text-muted-foreground",
                cycle.phase === "completed" && "bg-primary/20 text-primary",
              )}>
                {phaseShort[cycle.phase] || cycle.phase}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {!connected && countdown && device.number && (() => {
              const [hh, mm] = countdown.split(":");
              return (
                <div className="flex items-center gap-0.5 rounded-full bg-destructive/8 border border-destructive/15 px-1.5 py-0.5">
                  <Timer className="w-2.5 h-2.5 text-destructive/50 mr-0.5" />
                  <div className="flex items-center gap-0">
                    <div className="flex flex-col items-center">
                      <span className="text-[6px] font-medium text-destructive/40 uppercase leading-none">Hrs</span>
                      <span className="text-[10px] font-mono font-bold text-destructive/70 tabular-nums leading-tight">{hh}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-destructive/50 tabular-nums leading-tight mx-px">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-[6px] font-medium text-destructive/40 uppercase leading-none">Min</span>
                      <span className="text-[10px] font-mono font-bold text-destructive/70 tabular-nums leading-tight">{mm}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            {deviceTags && deviceTags.length > 0 && deviceTags.map((tag) => (
              <span key={tag.label} className="inline-flex items-center px-1.5 py-[3px] rounded-full text-[7px] font-bold text-white leading-none" style={{ backgroundColor: tag.color }}>
                {tag.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 pb-3 flex items-center gap-4">
        <div className={cn(
          "w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0",
          "ring-[2.5px] ring-offset-2 ring-offset-card",
          connected ? "ring-primary/40" : "ring-border/30"
        )}>
          {device.profile_picture ? (
            <img
              src={device.profile_picture}
              className="w-[52px] h-[52px] rounded-full object-cover"
              alt=""
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.onerror = null;
                el.src = "";
                el.style.display = "none";
              }}
            />
          ) : null}
          {!device.profile_picture ? (
            <div className={cn(
              "w-[52px] h-[52px] rounded-full flex items-center justify-center",
              connected ? "bg-primary/8" : "bg-muted/30"
            )}>
              <Phone className={cn("w-5 h-5", connected ? "text-primary" : "text-muted-foreground/40")} />
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-foreground truncate leading-tight">
            {device.name}
          </p>
          {device.number && (
            <p className="text-[11px] font-mono text-muted-foreground mt-1 tracking-wide">
              {formatPhone(device.number)}
            </p>
          )}
          {cycle && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                <Flame className="w-2.5 h-2.5 text-primary/60" />
                Dia {cycle.day_index}/{cycle.days_total}
              </p>
              <span className={cn(
                "inline-flex items-center px-1.5 py-[1px] rounded text-[8px] font-bold uppercase tracking-wider",
                cycle.chip_state === "new" && "bg-emerald-500/15 text-emerald-400",
                cycle.chip_state === "recovered" && "bg-amber-500/15 text-amber-400",
                cycle.chip_state === "unstable" && "bg-red-500/15 text-red-400",
              )}>
                {cycle.chip_state === "new" ? "Chip Novo" : cycle.chip_state === "recovered" ? "Recuperado" : "Chip Fraco"}
              </span>
            </div>
          )}
          {!cycle && connected && (
            <p className="text-[10px] text-muted-foreground/40 mt-1">Pronto para aquecer</p>
          )}
        </div>
      </div>


      <div className="px-3 md:px-4 pb-3 md:pb-4 space-y-1.5">
        {/* Tag button for folder view */}
        {availableTags && availableTags.length > 0 && onTagClick && (
          <button
            className="group/btn w-full flex items-center gap-3 px-3.5 h-9 rounded-[14px] text-[11px] md:text-xs font-medium bg-gradient-to-r from-card/80 to-card/40 backdrop-blur-sm border border-border/10 text-muted-foreground hover:text-foreground hover:border-primary/25 hover:from-primary/8 hover:to-primary/3 transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); onTagClick(device.id); }}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 group-hover/btn:bg-primary/20 transition-colors">
              <Tag className="w-3 h-3 text-primary/70 group-hover/btn:text-primary transition-colors" />
            </span>
            Gerenciar tags
          </button>
        )}
        {!connected ? (
          <button
            className="w-full flex items-center justify-center gap-2.5 px-3.5 h-10 rounded-[14px] text-[11px] md:text-xs font-bold bg-gradient-to-r from-primary to-primary/85 text-primary-foreground shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/30 hover:brightness-110 active:scale-[0.98] transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); onConnect(device); }}
          >
            <Wifi className="w-4 h-4 shrink-0" /> Conectar
          </button>
        ) : cycle && isWarming ? (
          <button
            className="group/btn w-full flex items-center gap-3 px-3.5 h-10 rounded-[14px] text-[11px] md:text-xs font-semibold bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 text-primary hover:border-primary/35 hover:from-primary/15 hover:to-primary/8 active:scale-[0.98] transition-all duration-200"
            onClick={(e) => onPause(device.id, e)}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/15">
              <Pause className="w-3 h-3" />
            </span>
            <span className="truncate">Parar aquecimento</span>
          </button>
        ) : cycle?.phase === "paused" ? (
          <button
            className="group/btn w-full flex items-center gap-3 px-3.5 h-10 rounded-[14px] text-[11px] md:text-xs font-semibold bg-gradient-to-r from-card/80 to-card/40 border border-border/15 text-foreground hover:border-primary/25 hover:from-primary/8 hover:to-primary/3 active:scale-[0.98] transition-all duration-200"
            onClick={(e) => onResume(device.id, e)}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/15">
              <Play className="w-3 h-3 text-primary" />
            </span>
            <span className="truncate">Retomar aquecimento</span>
          </button>
        ) : connected && !cycle ? (
          <button
            className="w-full flex items-center justify-center gap-2.5 px-3.5 h-10 rounded-[14px] text-[11px] md:text-xs font-bold bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-600/25 hover:shadow-lg hover:shadow-amber-600/30 hover:brightness-110 active:scale-[0.98] transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); onNavigate(`/dashboard/warmup-v2/${device.id}`); }}
          >
            <Flame className="w-4 h-4 shrink-0" /> Aquecer
          </button>
        ) : null}
        {cycle && (
          <button
            className="group/btn w-full flex items-center gap-3 px-3.5 h-9 rounded-[14px] text-[11px] md:text-xs font-medium bg-gradient-to-r from-destructive/8 to-destructive/3 border border-destructive/12 text-destructive/70 hover:text-destructive hover:border-destructive/25 hover:from-destructive/12 hover:to-destructive/6 active:scale-[0.98] transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); onCancel(device.id); }}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-destructive/10 group-hover/btn:bg-destructive/15 transition-colors">
              <XCircle className="w-3 h-3" />
            </span>
            <span className="truncate">Cancelar aquecimento</span>
          </button>
        )}
        {cycle && (
          <button
            className="group/btn w-full flex items-center gap-3 px-3.5 h-9 rounded-[14px] text-[11px] md:text-xs font-medium bg-gradient-to-r from-card/80 to-card/40 border border-border/10 text-muted-foreground hover:text-foreground hover:border-border/25 hover:from-muted/15 hover:to-muted/5 active:scale-[0.98] transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); onNavigate(`/dashboard/warmup-v2/${device.id}`); }}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-muted/20 group-hover/btn:bg-muted/30 transition-colors">
              <Pencil className="w-3 h-3 text-muted-foreground/60 group-hover/btn:text-foreground transition-colors" />
            </span>
            Editar
          </button>
        )}
        {onRemoveFromFolder && (
          <button
            className="group/btn w-full flex items-center gap-3 px-3.5 h-9 rounded-[14px] text-[11px] md:text-xs font-medium bg-gradient-to-r from-amber-500/8 to-amber-500/3 border border-amber-500/12 text-amber-500/70 hover:text-amber-500 hover:border-amber-500/25 hover:from-amber-500/12 hover:to-amber-500/6 active:scale-[0.98] transition-all duration-200"
            onClick={(e) => { e.stopPropagation(); onRemoveFromFolder(device.id); }}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/10 group-hover/btn:bg-amber-500/15 transition-colors">
              <FolderOpen className="w-3 h-3" />
            </span>
            <span className="truncate">Remover da pasta</span>
          </button>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.device === next.device &&
    prev.cycle === next.cycle &&
    prev.deviceTags === next.deviceTags &&
    prev.availableTags === next.availableTags &&
    prev.onPause === next.onPause &&
    prev.onResume === next.onResume &&
    prev.onCancel === next.onCancel &&
    prev.onConnect === next.onConnect &&
    prev.onNavigate === next.onNavigate &&
    prev.formatPhone === next.formatPhone &&
    prev.onTagClick === next.onTagClick &&
    prev.onRemoveFromFolder === next.onRemoveFromFolder
  );
});

DeviceCard.displayName = "DeviceCard";

const formatPhone = (num: string) => {
  const digits = num.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    const hyphenAt = rest.length - 4;
    return `+55 ${ddd} ${rest.slice(0, hyphenAt)}-${rest.slice(hyphenAt)}`;
  }
  return num;
};

/* ── Device Tag Assignment Dialog ── */
const DeviceTagAssignDialog = memo(({ open, onOpenChange, availableTags, currentTags, deviceName, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  availableTags: FolderTag[];
  currentTags: FolderTag[];
  deviceName: string;
  onSave: (tags: FolderTag[]) => Promise<void>;
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(new Set(currentTags.map(t => t.label)));
  }, [open, currentTags]);

  const toggle = (tag: FolderTag) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(tag.label) ? next.delete(tag.label) : next.add(tag.label);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(availableTags.filter(t => selected.has(t.label)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] bg-background/95 backdrop-blur-3xl border-border/10 p-0 overflow-hidden rounded-3xl shadow-[0_32px_80px_-12px_rgba(0,0,0,0.7)]">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-3 relative">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shadow-lg shadow-primary/10">
                <Tag className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-foreground">Tags</span>
                <span className="text-muted-foreground/50 font-medium ml-2 text-sm">— {deviceName}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 pb-3 space-y-2">
          {availableTags.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Tag className="w-6 h-6 text-muted-foreground/15" />
              <p className="text-xs text-muted-foreground/40 font-medium">Crie tags na pasta primeiro</p>
            </div>
          ) : (
            availableTags.map((tag) => {
              const isSelected = selected.has(tag.label);
              return (
                <button
                  key={tag.label}
                  onClick={() => toggle(tag)}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200",
                    isSelected
                      ? "bg-primary/[0.08] border-2 border-primary/25 shadow-sm"
                      : "hover:bg-muted/15 border-2 border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all",
                    isSelected ? "bg-primary border-primary shadow-[0_0_8px_hsl(var(--primary)/0.3)]" : "border-border/30"
                  )}>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                  </div>
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: tag.color, boxShadow: `0 4px 12px -2px ${tag.color}40` }}
                  >
                    {tag.label}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-border/10">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 h-11 rounded-xl text-xs font-bold border-border/20">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-11 rounded-xl text-xs font-black shadow-lg shadow-primary/20"
          >
            {saving ? "..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

const WarmupInstances = () => {
  const [searchParams] = useSearchParams();
  const activeFolderId = searchParams.get("folder");
  const { folders, addDevices, removeDevice, updateFolder, updateDeviceTags } = useWarmupFolders();
  const activeFolder = activeFolderId ? folders.find(f => f.id === activeFolderId) : null;
  const [addToFolderOpen, setAddToFolderOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [deviceTagTarget, setDeviceTagTarget] = useState<string | null>(null);
  const [removeFromFolderTarget, setRemoveFromFolderTarget] = useState<string | null>(null);
  
  // Bulk warmup state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<1 | 2 | 3>(1);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkInstanceSearch, setBulkInstanceSearch] = useState("");
  const [bulkChipState, setBulkChipState] = useState<"new" | "recovered" | "unstable">("new");
  const [bulkDaysTotal, setBulkDaysTotal] = useState("30");
  const [bulkStartDay, setBulkStartDay] = useState("1");
  const [bulkLoading, setBulkLoading] = useState(false);
  const bulkGroupSource = "custom" as const;
  const [customGroupDialogOpen, setCustomGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupLink, setNewGroupLink] = useState("");
  const safeBulkDaysTotal = String(Math.max(Number(bulkDaysTotal) || 1, Number(bulkStartDay) || 1));

  const openBulkWarmupDialog = useCallback(() => {
    setBulkSelected(new Set());
    setBulkInstanceSearch("");
    setBulkChipState("new");
    setBulkStartDay("1");
    setBulkDaysTotal("30");
    // group_source is always "custom" now
    setBulkOpen(true);
  }, []);

  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const engine = useWarmupEngine();
  const qc = useQueryClient();

  // Fetch user's custom groups
  const { data: userCustomGroups = [], refetch: refetchCustomGroups } = useQuery({
    queryKey: ["warmup_custom_groups", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_groups" as any)
        .select("id, name, link, is_custom, created_at")
        .eq("is_custom", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  // Always validate: user must have warmup_groups to start warmup (any day)
  const selectedDeviceIds = useMemo(() => Array.from(bulkSelected), [bulkSelected]);
  const isAdvancedStart = Number(bulkStartDay) > 1;
  const { data: deviceGroupCounts = {} } = useQuery({
    queryKey: ["device_groups_fast_check"],
    queryFn: async () => {
      const { count } = await supabase
        .from("warmup_groups")
        .select("id", { count: "exact", head: true })
        .eq("is_custom", true);
      return { _hasGroups: (count || 0) > 0 };
    },
    enabled: bulkOpen,
    staleTime: 30_000,
  });

  const userHasGroups = (deviceGroupCounts as any)?._hasGroups === true;

  const devicesWithoutGroups = useMemo(() => {
    if (userHasGroups) return [];
    return selectedDeviceIds;
  }, [selectedDeviceIds, userHasGroups]);

  const addCustomGroup = useCallback(async () => {
    if (!newGroupLink.trim() || !user) return;
    // Extrai nome automático do link
    const autoName = newGroupLink.trim().split("/").pop()?.slice(0, 20) || "Grupo";
    const { error } = await supabase.from("warmup_groups" as any).insert({
      user_id: user.id,
      name: newGroupName.trim() || autoName,
      link: newGroupLink.trim(),
      is_custom: true,
    });
    if (error) {
      toast({ title: "Erro ao adicionar grupo", description: error.message, variant: "destructive" });
      return;
    }
    setNewGroupName("");
    setNewGroupLink("");
    refetchCustomGroups();
    toast({ title: "Grupo adicionado" });
  }, [newGroupName, newGroupLink, user, toast, refetchCustomGroups]);

  const removeCustomGroup = useCallback(async (groupId: string) => {
    await supabase.from("warmup_groups" as any).delete().eq("id", groupId);
    refetchCustomGroups();
    toast({ title: "Grupo removido" });
  }, [refetchCustomGroups, toast]);

  const WARNING_DISMISS_KEY = "warmup_v2_warning_dismissed_v2";
  const [showWarning, setShowWarning] = useState(() =>
    localStorage.getItem(WARNING_DISMISS_KEY) !== "true"
  );
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [agreedResponsibility, setAgreedResponsibility] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // Connect dialog states
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState<any>(null);
  const [connectStep, setConnectStep] = useState<"choose" | "proxy" | "qr" | "code_phone" | "code" | "done">("choose");
  const [connectMethod, setConnectMethod] = useState<"qr" | "code">("qr");
  const [selectedProxy, setSelectedProxy] = useState("none");
  const [qrCodeBase64, setQrCodeBase64] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [connectError, setConnectError] = useState("");
  const [codePhone, setCodePhone] = useState("");
  const [qrCountdown, setQrCountdown] = useState(30);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const qrCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ["devices", user?.id],
    queryFn: async () => {
      // Paginated fetch to support 10k+ devices
      let all: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("devices")
          .select("id, name, number, status, profile_name, profile_picture, login_type, proxy_id, created_at, updated_at")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all.sort((a, b) => {
        const onlineStatuses = ["Connected", "Ready", "authenticated"];
        const aOnline = onlineStatuses.includes(a.status) ? 0 : 1;
        const bOnline = onlineStatuses.includes(b.status) ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        const tA = new Date(a.created_at).getTime();
        const tB = new Date(b.created_at).getTime();
        if (tA !== tB) return tA - tB;
        const numA = parseInt(a.name.match(/(\d+)$/)?.[1] || "0", 10);
        const numB = parseInt(b.name.match(/(\d+)$/)?.[1] || "0", 10);
        if (numA !== numB) return numA - numB;
        return a.name.localeCompare(b.name);
      });
    },
    enabled: !!user,
    refetchInterval: 120_000,
  });

  const { data: cycles = [], isLoading: cyclesLoading } = useWarmupCycles();
  const isLoading = devicesLoading || cyclesLoading;

  // Proxies
  const { data: dbProxies = [] } = useQuery({
    queryKey: ["proxies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proxies")
        .select("id, host, port, username, password, type, status, display_id, active")
        .eq("active", true)
        .order("display_id", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const availableProxies = dbProxies.map((p, index) => ({
    id: p.id,
    label: `#${index + 1} - ${p.host}:${p.port}`,
    host: p.host,
    port: p.port,
    username: p.username,
    password: p.password,
    type: p.type,
    status: p.status || "NOVA",
  }));

  const filteredDevices = useMemo(
    () => devices.filter((d) => d.login_type !== "report_wa"),
    [devices]
  );

  const cycleByDeviceId = useMemo(() => {
    const map = new Map<string, any>();
    for (const cycle of cycles) {
      if (!["completed", "error"].includes(cycle.phase)) {
        map.set(cycle.device_id, cycle);
      }
    }
    return map;
  }, [cycles]);

  const isConnected = (status: string) => CONNECTED_STATUSES.includes(status);

  const disconnectedCount = useMemo(
    () => filteredDevices.filter((d) => !isConnected(d.status)).length,
    [filteredDevices]
  );

  // Collect all device IDs assigned to any folder
  const allFolderDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    folders.forEach(f => (f.device_ids || []).forEach(id => ids.add(id)));
    return ids;
  }, [folders]);

  const displayed = useMemo(() => {
    return filteredDevices.filter((d) => {
      // Folder filter
      if (activeFolder && activeFolder.device_ids) {
        if (!activeFolder.device_ids.includes(d.id)) return false;
      } else if (!activeFolderId) {
        // Main view: hide devices that belong to any folder
        if (allFolderDeviceIds.has(d.id)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!d.name.toLowerCase().includes(q) && !(d.number || "").includes(q)) return false;
      }
      if (statusFilter === "connected" && !isConnected(d.status)) return false;
      if (statusFilter === "disconnected" && isConnected(d.status)) return false;
      if (statusFilter === "warming") {
        const cycle = cycleByDeviceId.get(d.id);
        if (!cycle || !cycle.is_running) return false;
      }
      return true;
    });
  }, [filteredDevices, search, statusFilter, cycleByDeviceId, activeFolder, activeFolderId, allFolderDeviceIds]);

  // --- Connect logic ---
  const callApi = async (body: Record<string, any>) => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) throw new Error("Not authenticated");
    const response = await supabase.functions.invoke("evolution-connect", {
      body,
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    if (response.error) {
      const realError = response.data?.error || response.error?.message || "Erro na Edge Function";
      const code = response.data?.code;
      return { error: realError, code };
    }
    return response.data;
  };

  const stopPolling = useCallback(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  const startPolling = (deviceId: string, proxyId: string | null) => {
    stopPolling();
    const interval = setInterval(async () => {
      try {
        const result = await callApi({ action: "status", deviceId });
        if (result?.error && result?.code === "DUPLICATE_PHONE") {
          clearInterval(interval);
          setPollingInterval(null);
          setConnectError(result.error);
          setQrCodeBase64("");
          qc.invalidateQueries({ queryKey: ["devices"] });
          return;
        }
        if (result?.status === "authenticated") {
          clearInterval(interval);
          setPollingInterval(null);
          setConnectStep("done");
          qc.invalidateQueries({ queryKey: ["devices"] });
          toast({ title: "Conectado!", description: "Instância conectada com sucesso!" });
          try {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (s) {
              await supabase.functions.invoke("sync-devices", {
                headers: { Authorization: `Bearer ${s.access_token}` },
              });
              qc.invalidateQueries({ queryKey: ["devices"] });
            }
          } catch {}
        }
      } catch {}
    }, 3000);
    setPollingInterval(interval);
  };

  // QR countdown timer
  useEffect(() => {
    if (connectStep === "qr" && qrCodeBase64) {
      setQrCountdown(30);
      if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
      qrCountdownRef.current = setInterval(() => {
        setQrCountdown(prev => {
          if (prev <= 1) {
            if (connectingDevice) {
              callApi({ action: "refreshQr", deviceId: connectingDevice.id }).then(result => {
                if (result?.alreadyConnected) {
                  setConnectStep("done");
                  qc.invalidateQueries({ queryKey: ["devices"] });
                  return;
                }
                const b64 = result?.base64 || result?.qr;
                if (b64) setQrCodeBase64(b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);
              }).catch(() => {});
            }
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (qrCountdownRef.current) { clearInterval(qrCountdownRef.current); qrCountdownRef.current = null; }
    }
    return () => { if (qrCountdownRef.current) { clearInterval(qrCountdownRef.current); qrCountdownRef.current = null; } };
  }, [connectStep, qrCodeBase64, connectingDevice]);

  const openConnect = useCallback((device: any) => {
    if (device.id.startsWith("temp-")) {
      toast({ title: "Aguarde", description: "A instância ainda está sendo criada.", variant: "destructive" });
      return;
    }
    setConnectingDevice(device);
    setConnectStep("choose");
    setQrCodeBase64("");
    setPairingCode("");
    setConnectError("");
    setCodePhone("");
    stopPolling();
    setSelectedProxy(device.proxy_id || "none");
    setConnectOpen(true);
  }, [stopPolling, toast]);

  const handleConnect = (method: "qr" | "code") => {
    setConnectMethod(method);
    setSelectedProxy(connectingDevice?.proxy_id || "none");
    setConnectStep("proxy");
  };

  const handleConfirmProxy = async () => {
    if (!connectingDevice) return;
    const proxyId = selectedProxy && selectedProxy !== "none" ? selectedProxy : null;

    if (proxyId) {
      await supabase.from("devices").update({ proxy_id: proxyId } as any).eq("id", connectingDevice.id);
      await supabase.from("proxies").update({ status: "USANDO" } as any).eq("id", proxyId);
      qc.invalidateQueries({ queryKey: ["proxies"] });
    } else if (selectedProxy === "none" && connectingDevice.proxy_id) {
      await supabase.from("devices").update({ proxy_id: null } as any).eq("id", connectingDevice.id);
      await supabase.from("proxies").update({ status: "USADA" } as any).eq("id", connectingDevice.proxy_id);
      qc.invalidateQueries({ queryKey: ["proxies"] });
    }

    setConnectError("");
    if (connectMethod === "code") {
      setConnectStep("code_phone");
      return;
    }
    setConnectStep("qr");

    try {
      const selectedProxyData = proxyId ? availableProxies.find(p => p.id === proxyId) : null;
      const proxyPayload = selectedProxyData ? {
        host: selectedProxyData.host,
        port: selectedProxyData.port,
        username: selectedProxyData.username,
        password: selectedProxyData.password,
        type: selectedProxyData.type,
      } : undefined;

      const connectResult = await callApi({
        action: "connect",
        deviceId: connectingDevice.id,
        proxyConfig: proxyPayload,
        proxyId: proxyId || undefined,
      });

      if (connectResult?.error) {
        setConnectError(connectResult.error);
        if (connectResult?.code === "PROXY_FAILED" || connectResult?.code === "DUPLICATE_PHONE") {
          setConnectStep("proxy");
        }
        qc.invalidateQueries({ queryKey: ["devices"] });
        toast({ title: "Erro de conexão", description: connectResult.error, variant: "destructive" });
        return;
      }

      if (connectResult.alreadyConnected) {
        qc.invalidateQueries({ queryKey: ["devices"] });
        setConnectStep("done");
        toast({ title: "Já conectado!" });
        return;
      }

      const b64 = connectResult.base64 || connectResult.qr;
      if (b64) {
        setQrCodeBase64(b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);
      } else {
        throw new Error("QR Code não retornado. Tente novamente.");
      }

      startPolling(connectingDevice.id, proxyId);
    } catch (err: any) {
      setConnectError(err?.message || "Erro ao conectar");
      toast({ title: "Erro ao gerar QR Code", description: err?.message, variant: "destructive" });
    }
  };

  const closeConnect = () => {
    stopPolling();
    setConnectStep("choose");
    setConnectOpen(false);
  };

  // Warmup actions
  const handlePause = useCallback((deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    qc.setQueryData(["warmup_cycles"], (old: any[]) =>
      old?.map((c: any) => c.device_id === deviceId && c.is_running ? { ...c, is_running: false, phase: "paused", previous_phase: c.phase } : c)
    );
    toast({ title: "Aquecimento pausado" });
    engine.mutate(
      { action: "pause", device_id: deviceId },
      { onError: () => { qc.invalidateQueries({ queryKey: ["warmup_cycles"] }); toast({ title: "Erro ao pausar", variant: "destructive" }); } }
    );
  }, [engine, qc, toast]);

  const handleResume = useCallback((deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    qc.setQueryData(["warmup_cycles"], (old: any[]) =>
      old?.map((c: any) => c.device_id === deviceId && c.phase === "paused" ? { ...c, is_running: true, phase: c.previous_phase || "groups_only" } : c)
    );
    toast({ title: "Aquecimento retomado" });
    engine.mutate(
      { action: "resume", device_id: deviceId },
      { onError: () => { qc.invalidateQueries({ queryKey: ["warmup_cycles"] }); toast({ title: "Erro ao retomar", variant: "destructive" }); } }
    );
  }, [engine, qc, toast]);

  const [cancelConfirmDevice, setCancelConfirmDevice] = useState<string | null>(null);

  const handleCancel = useCallback((deviceId: string) => {
    qc.setQueryData(["warmup_cycles"], (old: any[]) =>
      old?.filter((c: any) => c.device_id !== deviceId)
    );
    setCancelConfirmDevice(null);
    toast({ title: "Aquecimento cancelado" });
    engine.mutate(
      { action: "stop", device_id: deviceId },
      { onError: () => { qc.invalidateQueries({ queryKey: ["warmup_cycles"] }); toast({ title: "Erro ao cancelar", variant: "destructive" }); } }
    );
  }, [engine, qc, toast]);

  const onCancelClick = useCallback((deviceId: string) => {
    setCancelConfirmDevice(deviceId);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    navigate(activeFolderId ? `${path}?folder=${activeFolderId}` : path);
  }, [navigate, activeFolderId]);

  const handleTagClick = useCallback((deviceId: string) => {
    setDeviceTagTarget(deviceId);
  }, []);

  const handleRemoveFromFolderClick = useCallback((deviceId: string) => {
    setRemoveFromFolderTarget(deviceId);
  }, []);

  const renderDeviceCard = useCallback((device: any) => (
    <DeviceCard
      key={device.id}
      device={device}
      cycle={cycleByDeviceId.get(device.id)}
      onPause={handlePause}
      onResume={handleResume}
      onCancel={onCancelClick}
      onConnect={openConnect}
      onNavigate={handleNavigate}
      formatPhone={formatPhone}
      deviceTags={activeFolder?.device_tags?.get(device.id)}
      availableTags={activeFolder?.tags}
      onTagClick={activeFolder ? handleTagClick : undefined}
      onRemoveFromFolder={activeFolder ? handleRemoveFromFolderClick : undefined}
    />
  ), [cycleByDeviceId, handlePause, handleResume, onCancelClick, openConnect, handleNavigate, activeFolder, handleTagClick, handleRemoveFromFolderClick]);
  

  return (
    <div className="space-y-5">
      {/* Warning popup - chips novos */}
      <Dialog open={showWarning} onOpenChange={(open) => { if (!open) { setShowWarning(false); if (!agreedResponsibility) navigate("/dashboard"); } }}>
        <DialogContent className="max-w-md rounded-2xl border-none bg-[#0f1419] p-0 overflow-hidden relative" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { setShowWarning(false); if (!agreedResponsibility) navigate("/dashboard"); }}>
          {/* Subtle animated glow border */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
            <div className="absolute inset-[-2px] rounded-2xl opacity-40" style={{
              background: 'conic-gradient(from var(--glow-angle, 0deg), transparent 0%, hsl(180 40% 45% / 0.5) 15%, transparent 30%, hsl(35 60% 50% / 0.35) 50%, transparent 65%, hsl(180 40% 45% / 0.4) 80%, transparent 100%)',
              animation: 'warmup-glow-spin 8s linear infinite',
            }} />
            <div className="absolute inset-[1px] rounded-2xl bg-[#0f1419]" />
          </div>

          {/* Inner content wrapper */}
          <div className="relative z-10">
            {/* Logo + Header */}
            <div className="flex flex-col items-center pt-7 pb-4 px-6">
              <div className="relative mb-4">
                <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-teal-500/20 via-amber-500/10 to-teal-500/15 blur-lg pointer-events-none" />
                <img
                  src={dgLogoNew}
                  alt="DG Logo"
                  className="relative w-16 h-16 rounded-2xl shadow-lg ring-1 ring-white/10"
                />
              </div>
              <h2 className="text-base font-bold text-white tracking-tight text-center">Orientações antes de começar</h2>
              <p className="text-xs text-white/40 mt-1 text-center">Leia com atenção para garantir a segurança do seu chip.</p>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mx-6" />

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-3 text-[13px] text-white/55 leading-relaxed">
                <p>
                  Antes de conectar o chip ao QR Code, realize ao menos uma <strong className="text-white/90 font-medium">interação manual</strong> no aparelho — como enviar uma mensagem ou fazer uma ligação.
                </p>
                <p>
                  Essa etapa inicial reduz significativamente o risco de <strong className="text-white/90 font-medium">restrições durante o aquecimento</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5 flex items-start gap-3">
                <Shield className="w-4 h-4 text-teal-400/80 mt-0.5 shrink-0" />
                <p className="text-xs text-white/45 leading-relaxed">
                  <strong className="text-white/75 font-medium">Termo de uso</strong> — Esta ferramenta auxilia no processo de aquecimento. O usuário é responsável por seguir as boas práticas recomendadas e pela utilização adequada dos recursos disponibilizados.
                </p>
              </div>

              {/* Checkboxes */}
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 cursor-pointer transition-colors hover:bg-white/[0.05]" onClick={() => setAgreedResponsibility(!agreedResponsibility)}>
                  <Checkbox id="agreeResponsibility" checked={agreedResponsibility} onCheckedChange={(v) => setAgreedResponsibility(!!v)} className="mt-0.5 border-white/20 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500" />
                  <label htmlFor="agreeResponsibility" className="text-[13px] text-white/50 cursor-pointer select-none leading-relaxed">
                    Li e concordo com as orientações de uso responsável.
                  </label>
                </div>

                <div className="flex items-center gap-2 pl-1">
                  <Checkbox id="dontShowAgainV2" checked={dontShowAgain} onCheckedChange={(v) => setDontShowAgain(!!v)} className="border-white/15 data-[state=checked]:bg-teal-500/80 data-[state=checked]:border-teal-500/80" />
                  <label htmlFor="dontShowAgainV2" className="text-xs text-white/30 cursor-pointer select-none">Não mostrar novamente</label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6">
              <Button
                className="w-full h-11 text-sm font-semibold rounded-xl transition-all duration-300 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white shadow-lg shadow-teal-500/20 disabled:opacity-40 disabled:shadow-none"
                disabled={!agreedResponsibility}
                onClick={() => {
                  if (dontShowAgain) localStorage.setItem(WARNING_DISMISS_KEY, "true");
                  setShowWarning(false);
                }}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Entendi e continuar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Connect dialog */}
      <Dialog open={connectOpen} onOpenChange={(open) => { if (!open) closeConnect(); }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-border/20">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                connectStep === "done" ? "bg-emerald-500/15" : "bg-primary/10"
              )}>
                {connectStep === "done" ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                ) : connectStep === "qr" || connectStep === "code" ? (
                  <QrCode className="w-6 h-6 text-primary" />
                ) : (
                  <Smartphone className="w-6 h-6 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {connectStep === "done" ? "Conectado com sucesso!" : connectStep === "qr" ? "Escaneie o QR Code" : connectStep === "code" ? "Código de pareamento" : "Conectar WhatsApp"}
                </DialogTitle>
                {connectingDevice && connectStep !== "done" && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {connectingDevice.profile_name || connectingDevice.name}{connectingDevice.number ? ` · ${formatPhone(connectingDevice.number)}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5 overflow-hidden">
            <AnimatePresence mode="wait">
              {connectStep === "choose" && (
                <motion.div key="choose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="space-y-5">
                  <p className="text-sm text-muted-foreground">Como deseja conectar seu WhatsApp?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleConnect("qr")}
                      className="group relative flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border/30 hover:border-primary/50 bg-card hover:bg-primary/[0.04] transition-all duration-200"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                        <QrCode className="w-7 h-7 text-primary" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-bold text-foreground block">QR Code</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 block">Escaneie com o celular</span>
                      </div>
                    </button>
                    <button
                      onClick={() => handleConnect("code")}
                      className="group relative flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border/30 hover:border-primary/50 bg-card hover:bg-primary/[0.04] transition-all duration-200"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                        <Key className="w-7 h-7 text-primary" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-bold text-foreground block">Código</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 block">Digite um código numérico</span>
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}

              {connectStep === "proxy" && (
                <motion.div key="proxy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="space-y-5">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Shield className="w-6 h-6 text-primary" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-medium text-foreground">Configurar proxy</p>
                      <p className="text-xs text-muted-foreground">Proteja sua conexão com um proxy <span className="text-muted-foreground/50">(opcional)</span></p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Select value={selectedProxy} onValueChange={setSelectedProxy}>
                      <SelectTrigger className="h-12 text-sm bg-muted/30 border-border/50">
                        <SelectValue placeholder="Sem proxy" />
                      </SelectTrigger>
                      <SelectContent side="bottom" align="start" className="max-h-[250px]">
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            <Ban className="w-3.5 h-3.5 text-muted-foreground/50" />
                            <span className="text-sm text-muted-foreground">Sem proxy</span>
                          </div>
                        </SelectItem>
                        {availableProxies.map(p => {
                          const cls = p.status === "USANDO" ? "text-amber-500 border-amber-500/20 bg-amber-500/10" : p.status === "USADA" ? "text-red-400 border-red-500/20 bg-red-500/10" : "text-emerald-500 border-emerald-500/20 bg-emerald-500/10";
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{p.label}</span>
                                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-semibold", cls)}>{p.status}</Badge>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {selectedProxy !== "none" && (
                      <p className="text-[11px] text-primary/70 text-center flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Proxy será testada antes de conectar
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" className="flex-1 h-11 text-sm" onClick={closeConnect}>
                      Cancelar
                    </Button>
                    <Button className="flex-1 h-11 text-sm font-semibold" onClick={handleConfirmProxy}>
                      Conectar
                    </Button>
                  </div>
                </motion.div>
              )}

              {connectStep === "qr" && (
                <motion.div key="qr" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-5">
                  <div className="relative w-[272px] h-[272px]">
                    {/* Loading */}
                    <div className={cn(
                      "absolute inset-0 w-64 h-64 m-auto rounded-2xl flex flex-col items-center justify-center border border-primary/20 bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden transition-all duration-500",
                      !qrCodeBase64 && !connectError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                    )}>
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
                        <QrCode className="w-8 h-8 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Gerando QR Code...</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">Aguarde alguns segundos</p>
                    </div>
                    {/* Error */}
                    <div className={cn(
                      "absolute inset-0 w-64 h-64 m-auto bg-destructive/5 rounded-2xl flex flex-col items-center justify-center border-2 border-destructive/20 p-6 transition-all duration-500",
                      connectError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                    )}>
                      <XCircle className="w-10 h-10 text-destructive mb-3" />
                      <p className="text-sm text-destructive text-center leading-relaxed">{connectError}</p>
                    </div>
                    {/* QR Code */}
                    <div className={cn(
                      "absolute inset-0 flex items-center justify-center transition-all duration-500",
                      qrCodeBase64 ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                    )}>
                      <div className="relative p-4 rounded-2xl bg-white dark:bg-white shadow-lg">
                        <img src={qrCodeBase64} alt="QR Code" className="w-64 h-64 rounded-lg" />
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-card border border-border/30 rounded-full px-3 py-1 shadow-sm">
                          <svg className="w-4 h-4 -rotate-90" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
                            <circle cx="12" cy="12" r="10" fill="none" stroke="hsl(var(--primary))" strokeWidth="2"
                              strokeDasharray={`${(qrCountdown / 30) * 62.83} 62.83`}
                              strokeLinecap="round"
                              className="transition-all duration-1000 ease-linear"
                            />
                          </svg>
                          <span className="text-[11px] text-muted-foreground font-medium tabular-nums">{qrCountdown}s</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-muted/30 rounded-xl p-4 space-y-2.5">
                    <p className="text-xs font-semibold text-foreground mb-2">Como conectar:</p>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="text-xs text-muted-foreground">Abra o <span className="font-medium text-foreground">WhatsApp</span> no celular</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="text-xs text-muted-foreground">Toque em <span className="font-medium text-foreground">Configurações → Aparelhos conectados</span></p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <p className="text-xs text-muted-foreground">Toque em <span className="font-medium text-foreground">Conectar um aparelho</span> e escaneie o código</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2 h-9 text-sm w-full"
                    onClick={async () => {
                      try {
                        const result = await callApi({ action: "status", deviceId: connectingDevice!.id });
                        if (result?.status === "authenticated") {
                          stopPolling();
                          setConnectStep("done");
                          qc.invalidateQueries({ queryKey: ["devices"] });
                          toast({ title: "Conectado!" });
                          try {
                            const { data: { session: s } } = await supabase.auth.getSession();
                            if (s) {
                              await supabase.functions.invoke("sync-devices", { headers: { Authorization: `Bearer ${s.access_token}` } });
                              qc.invalidateQueries({ queryKey: ["devices"] });
                            }
                          } catch {}
                        } else {
                          toast({ title: "⏳ QR Code ainda não foi escaneado", description: "Escaneie o QR Code acima e aguarde a conexão." });
                        }
                      } catch {
                        toast({ title: "Erro ao verificar", description: "Tente novamente." });
                      }
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Já escaneei, sincronizar
                  </Button>
                </motion.div>
              )}

              {connectStep === "code_phone" && (() => {
                const rawDigits = codePhone.replace(/\D/g, "");
                const isValid = rawDigits.length >= 12;
                const handleRequestCode = async () => {
                  if (!connectingDevice || !isValid) return;
                  setConnectStep("code");
                  try {
                    const pd = connectingDevice.proxy_id ? availableProxies.find(p => p.id === connectingDevice.proxy_id) : null;
                    const pp = pd ? { host: pd.host, port: pd.port, username: pd.username, password: pd.password, type: pd.type } : undefined;
                    const result = await callApi({ action: "requestPairingCode", deviceId: connectingDevice.id, phoneNumber: rawDigits, proxyConfig: pp, proxyId: connectingDevice.proxy_id || undefined });
                    if (result?.error && result?.code === "PROXY_FAILED") {
                      setConnectError(result.error);
                      setConnectStep("proxy");
                      qc.invalidateQueries({ queryKey: ["proxies"] });
                      toast({ title: "Proxy inválida", description: result.error, variant: "destructive" });
                      return;
                    }
                    if (result.alreadyConnected) { setConnectStep("done"); toast({ title: "Já conectado!" }); return; }
                    const code = result.pairingCode || result.pairing_code;
                    if (code) { setPairingCode(code); startPolling(connectingDevice.id, null); }
                    else { toast({ title: "Código não disponível", description: "Conecte via QR Code.", variant: "destructive" }); setConnectStep("choose"); }
                  } catch {
                    toast({ title: "Código não disponível", description: "Conecte via QR Code.", variant: "destructive" });
                    setConnectStep("choose");
                  }
                };
                return (
                  <motion.div key="code_phone" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="space-y-5">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Smartphone className="w-6 h-6 text-primary" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-medium text-foreground">Conectar via código</p>
                        <p className="text-xs text-muted-foreground">Insira o número completo com código do país</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                          <span className="text-base">🇧🇷</span>
                        </div>
                        <Input
                          value={codePhone}
                          onChange={e => {
                            const raw = e.target.value.replace(/\D/g, "").slice(0, 13);
                            let f = raw;
                            if (raw.length > 2) f = `+${raw.slice(0, 2)} ${raw.slice(2)}`;
                            if (raw.length > 4) f = `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4)}`;
                            if (raw.length > 9) f = `+${raw.slice(0, 2)} ${raw.slice(2, 4)} ${raw.slice(4, 9)}-${raw.slice(9)}`;
                            setCodePhone(f);
                          }}
                          placeholder="+55 11 99999-9999"
                          className="h-14 pl-10 text-lg font-mono tracking-wider bg-muted/30 border-border/50 focus-visible:border-primary/60 focus-visible:ring-primary/20 transition-all"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter" && isValid) handleRequestCode(); }}
                        />
                        {isValid && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <CheckCircle2 className="w-5 h-5 text-primary" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 text-center flex items-center justify-center gap-1">
                        <span>Ex:</span> <span className="font-mono">+55 63 91234-5678</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" className="flex-1 h-11 text-sm" onClick={() => setConnectStep("proxy")}>Voltar</Button>
                      <Button className="flex-1 h-11 text-sm font-semibold" disabled={!isValid} onClick={handleRequestCode}>Gerar código</Button>
                    </div>
                  </motion.div>
                );
              })()}

              {connectStep === "code" && (
                <motion.div key="code" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }} className="flex flex-col items-center gap-5">
                  {pairingCode ? (
                    <div className="relative px-10 py-6 rounded-2xl bg-card border-2 border-primary/20 shadow-lg">
                      <p className="text-3xl font-mono font-bold tracking-[0.5em] text-foreground">{pairingCode}</p>
                      <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
                        <Lock className="w-4 h-4 text-primary-foreground" />
                      </div>
                    </div>
                  ) : connectError ? (
                    <div className="px-8 py-5 rounded-2xl bg-destructive/5 border-2 border-destructive/20">
                      <p className="text-sm text-destructive text-center">{connectError}</p>
                    </div>
                  ) : (
                    <div className="w-64 py-8 rounded-2xl flex flex-col items-center justify-center border-2 border-border/20 bg-muted/10">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <Key className="w-7 h-7 text-primary animate-pulse" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Gerando código...</p>
                      <div className="flex items-center gap-1.5 mt-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                  <div className="w-full bg-muted/30 rounded-xl p-4 space-y-2.5">
                    <p className="text-xs font-semibold text-foreground mb-2">Como conectar:</p>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <p className="text-xs text-muted-foreground">Abra o <span className="font-medium text-foreground">WhatsApp</span> no celular</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <p className="text-xs text-muted-foreground">Vá em <span className="font-medium text-foreground">Aparelhos conectados → Conectar com número</span></p>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <p className="text-xs text-muted-foreground">Digite o código acima</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {connectStep === "done" && (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="flex flex-col items-center gap-5 py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">Conectado com sucesso!</p>
                    <p className="text-sm text-muted-foreground mt-1">Sua instância está pronta para uso</p>
                  </div>
                  <Button className="h-10 px-8" onClick={closeConnect}>Fechar</Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Flame className="w-5 h-5 text-primary" />
            {activeFolder ? (
              <>
                <span className="text-muted-foreground font-medium">Aquecimento /</span>
                <span style={{ color: activeFolder.color }}>{activeFolder.name}</span>
              </>
            ) : (
              "Aquecimento Automático"
            )}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            {activeFolder ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                Total: <strong className="text-foreground">{displayed.length}</strong>
              </span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Total: <strong className="text-foreground">{filteredDevices.length}</strong>
                </span>
                {disconnectedCount > 0 && (
                  <span className="text-xs text-destructive tabular-nums">
                    Chips desconectados: <strong>{disconnectedCount}</strong>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeFolder && (
            <>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => setFolderDialogOpen(true)}>
                <Tag className="w-3.5 h-3.5" /> Tags
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setAddToFolderOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Adicionar Instância
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white" onClick={openBulkWarmupDialog}>
                <Flame className="w-3.5 h-3.5" /> Aquecer em massa
              </Button>
            </>
          )}
          {!activeFolder && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-3 h-3" /> Filtros
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white" onClick={openBulkWarmupDialog}>
                <Flame className="w-3.5 h-3.5" /> Aquecer em massa
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters - only on main view */}
      {!activeFolder && showFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-card/50 border-border/30"
            />
          </div>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-2xl border border-border/20 bg-gradient-to-b from-card/80 to-card/40 p-10 sm:p-16 text-center relative overflow-hidden">
          {activeFolder ? (
            /* Folder empty state */
            <div className="relative z-10 flex flex-col items-center gap-4 max-w-sm mx-auto py-4">
              <div className="w-16 h-16 rounded-2xl border border-border/20 flex items-center justify-center" style={{ backgroundColor: `${activeFolder.color}15` }}>
                <FolderOpen className="w-7 h-7" style={{ color: activeFolder.color }} />
              </div>
              <div className="space-y-1.5 text-center">
                <h3 className="text-base font-bold text-foreground">Pasta vazia</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Adicione instâncias de aquecimento a esta pasta para organizá-las.
                </p>
              </div>
              <Button size="default" className="mt-1 gap-2 h-10 px-6 text-sm font-semibold" onClick={() => setAddToFolderOpen(true)}>
                <Plus className="w-4 h-4" />
                Adicionar Instância
              </Button>
            </div>
          ) : (
            /* Main empty state */
            <div className="relative z-10 flex flex-col items-center gap-5 max-w-md mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10 flex items-center justify-center shadow-lg shadow-primary/5">
                <Flame className="w-9 h-9 text-primary/70" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-foreground">Nenhuma instância encontrada</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Conecte suas instâncias do WhatsApp para iniciar o aquecimento automático e fortalecer seus chips.
                </p>
              </div>
              <div className="flex items-center gap-6 text-[11px] text-muted-foreground/60 mt-1">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Conecte</span>
                </div>
                <div className="w-4 h-px bg-border/40" />
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Aqueça</span>
                </div>
                <div className="w-4 h-px bg-border/40" />
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Proteja</span>
                </div>
              </div>
              <Button size="lg" className="mt-2 gap-2 h-11 px-8 text-sm font-semibold shadow-md shadow-primary/10" onClick={() => navigate("/dashboard/devices")}>
                <Plus className="w-4 h-4" />
                Conectar Instância
              </Button>
            </div>
          )}
        </div>
      ) : (
        <VirtualizedDeviceGrid
          items={displayed}
          renderItem={renderDeviceCard}
        />
      )}

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelConfirmDevice} onOpenChange={(open) => { if (!open) setCancelConfirmDevice(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Cancelar aquecimento?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Essa ação irá encerrar o ciclo de aquecimento desta instância. Todo o progresso será perdido e você precisará iniciar um novo aquecimento.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelConfirmDevice(null)}>
              Voltar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => cancelConfirmDevice && handleCancel(cancelConfirmDevice)}>
              Sim, cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Remove from folder confirmation */}
      <Dialog open={!!removeFromFolderTarget} onOpenChange={(open) => { if (!open) setRemoveFromFolderTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Remover da pasta?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A instância <strong>{removeFromFolderTarget ? (displayed.find(d => d.id === removeFromFolderTarget)?.name || "") : ""}</strong> será removida desta pasta. Ela continuará disponível na lista geral.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setRemoveFromFolderTarget(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (removeFromFolderTarget && activeFolder) {
                  removeDevice.mutateAsync({ folderId: activeFolder.id, deviceId: removeFromFolderTarget }).then(() => {
                    toast({ title: "Instância removida da pasta" });
                    setRemoveFromFolderTarget(null);
                  });
                }
              }}
            >
              Sim, remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Bulk warmup dialog — Wizard redesign */}
      <Dialog open={bulkOpen} onOpenChange={(v) => { setBulkOpen(v); if (!v) setBulkStep(1); }}>
        <DialogContent className="max-w-[540px] p-0 overflow-hidden rounded-3xl border-border/10 shadow-[0_32px_80px_-12px_rgba(0,0,0,0.7)] backdrop-blur-3xl bg-background/95">
          {/* ── Stepper header ── */}
          <div className="relative px-7 pt-7 pb-5">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-primary/[0.03] pointer-events-none" />
            <div className="relative flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shrink-0 shadow-xl shadow-amber-500/30">
                <Flame className="w-7 h-7 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight">Aquecer em massa</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                  {bulkStep === 1 ? "Passo 1 — Perfil do chip" : bulkStep === 2 ? "Passo 2 — Grupos e dias" : "Passo 3 — Selecione as instâncias"}
                </p>
              </div>
            </div>
            {/* Step indicator */}
            <div className="relative flex items-center gap-1">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex-1 relative">
                  <div className={cn(
                    "h-1.5 rounded-full transition-all duration-500",
                    s <= bulkStep
                      ? "bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                      : "bg-border/20"
                  )} />
                </div>
              ))}
            </div>
          </div>

          <div className="px-7 pb-2 max-h-[55vh] overflow-y-auto scrollbar-thin">
            {/* ═══════ STEP 1: Chip State ═══════ */}
            {bulkStep === 1 && (
              <div className="space-y-5 py-2">
                <p className="text-[11px] font-extrabold text-foreground uppercase tracking-[0.18em]">Estado do chip</p>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: "new" as const, label: "Chip Novo", desc: "Progressão conservadora", emoji: "🟢", gradient: "from-emerald-500/25 to-emerald-700/10", border: "border-emerald-500/60 ring-2 ring-emerald-500/20", dot: "bg-emerald-500 shadow-[0_0_10px_hsl(142_72%_36%/0.7)]" },
                    { value: "recovered" as const, label: "Recuperado", desc: "Extra cauteloso, já sofreu ban", emoji: "🟡", gradient: "from-amber-500/25 to-amber-700/10", border: "border-amber-400/60 ring-2 ring-amber-500/20", dot: "bg-amber-500 shadow-[0_0_10px_hsl(38_92%_50%/0.7)]" },
                    { value: "unstable" as const, label: "Chip Fraco", desc: "Sofre restrição facilmente", emoji: "🔴", gradient: "from-red-500/25 to-red-700/10", border: "border-red-400/60 ring-2 ring-red-500/20", dot: "bg-red-500 shadow-[0_0_10px_hsl(0_84%_50%/0.7)]" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setBulkChipState(opt.value)}
                      className={cn(
                        "relative text-left p-5 rounded-2xl border-2 transition-all duration-300 group overflow-hidden hover:scale-[1.02]",
                        bulkChipState === opt.value
                          ? `${opt.border} shadow-xl`
                          : "border-border/15 hover:border-border/30 bg-card/30"
                      )}
                    >
                      {bulkChipState === opt.value && (
                        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-80 pointer-events-none", opt.gradient)} />
                      )}
                      <div className="relative">
                        <div className={cn("w-4 h-4 rounded-full transition-all", opt.dot, bulkChipState !== opt.value && "opacity-30 shadow-none")} />
                        <p className="text-sm font-black text-foreground mt-3 leading-tight">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug font-medium">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ═══════ STEP 2: Groups + Days ═══════ */}
            {bulkStep === 2 && (
              <div className="space-y-6 py-2">
                {/* Day range */}
                <div className="space-y-3">
                  <p className="text-[11px] font-extrabold text-foreground uppercase tracking-[0.18em]">Intervalo de dias</p>
                  <p className="text-[10px] text-muted-foreground font-medium -mt-1">Escolha o dia inicial e o dia final do ciclo</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Dia inicial</label>
                      <Select value={bulkStartDay} onValueChange={(v) => {
                        setBulkStartDay(v);
                        if (Number(v) > Number(bulkDaysTotal)) setBulkDaysTotal(v);
                      }}>
                        <SelectTrigger className="rounded-xl h-12 bg-card/50 border-2 border-border/20 hover:border-primary/30 text-sm font-bold transition-all">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
                            <SelectItem key={d} value={String(d)}>
                              <span className="font-semibold">Dia {d}</span>
                              {d === 1 && <span className="text-[10px] text-primary ml-2 font-bold">Início</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Dia final</label>
                      <Select value={safeBulkDaysTotal} onValueChange={setBulkDaysTotal}>
                        <SelectTrigger className="rounded-xl h-12 bg-card/50 border-2 border-border/20 hover:border-primary/30 text-sm font-bold transition-all">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 30 }, (_, i) => i + 1).filter(d => d >= Number(bulkStartDay)).map(d => (
                            <SelectItem key={d} value={String(d)}>
                              <span className="font-semibold">Dia {d}</span>
                              {d === 30 && <span className="text-[10px] text-primary ml-2 font-bold">Máximo</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {isAdvancedStart && (
                    <div className="rounded-xl border-2 border-amber-500/25 bg-amber-500/[0.06] px-4 py-3.5 mt-2 space-y-2">
                      <p className="text-[11px] text-amber-400 font-extrabold">⚡ Início avançado — Dia {bulkStartDay}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">O ciclo vai pular as fases anteriores e iniciar direto na fase correspondente ao dia {bulkStartDay}.</p>
                      <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-amber-500/[0.08] border border-amber-500/15">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-[10px] text-amber-300 font-bold">Pré-requisito</p>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">As instâncias devem <strong>já ter entrado nos grupos</strong> antes de iniciar o aquecimento avançado.</p>
                        </div>
                      </div>
                      {bulkSelected.size > 0 && devicesWithoutGroups.length > 0 && (
                        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1.5">
                          <p className="text-[10px] text-destructive font-bold flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" />
                            {devicesWithoutGroups.length} instância(s) sem grupos
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {devicesWithoutGroups.slice(0, 5).map(id => {
                              const dev = (activeFolder ? displayed : filteredDevices).find((d: any) => d.id === id);
                              return dev ? (
                                <span key={id} className="text-[9px] px-2 py-0.5 rounded-md bg-destructive/10 text-destructive font-medium">{dev.name}</span>
                              ) : null;
                            })}
                            {devicesWithoutGroups.length > 5 && (
                              <span className="text-[9px] px-2 py-0.5 rounded-md bg-muted/20 text-muted-foreground font-medium">+{devicesWithoutGroups.length - 5}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {bulkSelected.size > 0 && devicesWithoutGroups.length === 0 && selectedDeviceIds.length > 0 && (
                        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                          <p className="text-[10px] text-primary font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Todas instâncias com grupos ✓
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Groups — read-only list */}
                <div className="space-y-3">
                  <p className="text-[11px] font-extrabold text-foreground uppercase tracking-[0.18em]">Grupos de aquecimento</p>
                  <p className="text-[10px] text-muted-foreground -mt-1.5 font-medium">Os grupos cadastrados na página <strong>Grupos</strong> serão usados.</p>

                  {userCustomGroups.length > 0 ? (
                    <div className="rounded-xl border-2 border-border/10 bg-card/20 p-2 max-h-[180px] overflow-y-auto space-y-1 scrollbar-thin">
                      {userCustomGroups.map((g: any) => (
                        <div key={g.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-muted/10 transition-colors">
                          <Users className="w-4 h-4 text-primary/60 shrink-0" />
                          <span className="text-xs font-bold text-foreground truncate flex-1">{g.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-amber-500/25 bg-amber-500/[0.04] px-4 py-4 text-center">
                      <Users className="w-5 h-5 text-amber-500/50 mx-auto mb-2" />
                      <p className="text-[11px] text-amber-400 font-bold">Nenhum grupo cadastrado</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Cadastre grupos na página Grupos para iniciar.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══════ STEP 3: Instances ═══════ */}
            {bulkStep === 3 && (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-extrabold text-foreground uppercase tracking-[0.18em]">Instâncias</p>
                  <button
                    className="text-[11px] text-primary hover:text-primary/80 font-bold transition-colors"
                    onClick={() => {
                      const sourceDevices = activeFolder ? displayed : filteredDevices;
                      const eligible = sourceDevices.filter(d => CONNECTED_STATUSES.includes(d.status) && !cycleByDeviceId.has(d.id));
                      setBulkSelected(prev => prev.size === eligible.length ? new Set() : new Set(eligible.map(d => d.id)));
                    }}
                  >
                    {bulkSelected.size > 0 ? "Desmarcar todos" : "Selecionar todos"}
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none" />
                  <Input
                    value={bulkInstanceSearch}
                    onChange={(e) => setBulkInstanceSearch(e.target.value)}
                    placeholder="Buscar por nome ou número..."
                    className="h-11 pl-10 text-xs bg-card/50 border-2 border-border/20 focus-visible:border-primary/40 rounded-xl font-medium"
                  />
                </div>

                <div className="max-h-[380px] overflow-y-auto space-y-1 rounded-2xl border-2 border-border/10 bg-card/15 p-2 scrollbar-thin">
                  {(() => {
                    const src = (activeFolder ? displayed : filteredDevices).filter(d => CONNECTED_STATUSES.includes(d.status));
                    const q = bulkInstanceSearch.trim().toLowerCase();
                    const list = q ? src.filter(d => d.name.toLowerCase().includes(q) || (d.number || "").includes(q)) : src;
                    return list.length === 0 ? (
                      <div className="flex flex-col items-center py-10 gap-2">
                        <Smartphone className="w-7 h-7 text-muted-foreground/20" />
                        <p className="text-xs text-muted-foreground/50 font-medium">{q ? "Nenhum resultado" : "Nenhuma instância disponível"}</p>
                      </div>
                    ) : (
                      list.map(d => {
                        const isWarming = cycleByDeviceId.has(d.id);
                        return (
                          <div
                            key={d.id}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                              isWarming
                                ? "opacity-40 cursor-not-allowed"
                                : "cursor-pointer",
                              !isWarming && bulkSelected.has(d.id)
                                ? "bg-primary/[0.1] border-2 border-primary/30 shadow-sm shadow-primary/5"
                                : "hover:bg-muted/15 border-2 border-transparent"
                            )}
                            onClick={() => {
                              if (isWarming) return;
                              setBulkSelected(prev => {
                                const next = new Set(prev);
                                next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                                return next;
                              });
                            }}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                              isWarming
                                ? "border-border/15 bg-transparent"
                                : bulkSelected.has(d.id) ? "bg-primary border-primary shadow-[0_0_8px_hsl(var(--primary)/0.3)]" : "border-border/30 bg-transparent"
                            )}>
                              {!isWarming && bulkSelected.has(d.id) && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-foreground truncate">{d.name}</p>
                              {d.number && <p className="text-[10px] text-muted-foreground/50 font-mono tracking-wider mt-0.5">{formatPhone(d.number)}</p>}
                            </div>
                            {isWarming ? (
                              <Flame className="w-4 h-4 text-orange-400 shrink-0 animate-pulse" />
                            ) : bulkSelected.has(d.id) ? (
                              <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                            ) : null}
                          </div>
                        );
                      })
                    );
                  })()}
                </div>
                <p className="text-[10px] text-muted-foreground/50 text-right tabular-nums font-semibold">
                  {bulkSelected.size} de {(activeFolder ? displayed : filteredDevices).filter(d => CONNECTED_STATUSES.includes(d.status) && !cycleByDeviceId.has(d.id)).length} disponível · <Flame className="w-3 h-3 text-orange-400 inline" /> = já aquecendo
                </p>

              </div>
            )}
          </div>

          {/* ── Footer with navigation ── */}
          <div className="px-7 pb-7 pt-4 border-t border-border/10">
            {bulkStep === 3 && userCustomGroups.length === 0 && (
              <div className="flex items-center gap-2 p-3.5 mb-3 rounded-xl bg-amber-500/10 border-2 border-amber-500/20 text-amber-400 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Cadastre pelo menos 1 grupo no passo anterior.</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              {bulkStep === 1 ? (
                <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold border-border/20 text-sm" onClick={() => setBulkOpen(false)}>
                  Cancelar
                </Button>
              ) : (
                <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold border-border/20 text-sm gap-2" onClick={() => setBulkStep(s => Math.max(1, s - 1) as 1 | 2 | 3)}>
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </Button>
              )}
              {bulkStep < 3 ? (
                <Button
                  className={cn(
                    "flex-1 gap-2 h-12 rounded-xl font-black text-sm transition-all duration-300",
                    "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white",
                    "shadow-[0_8px_24px_-6px_hsl(38_92%_50%/0.4)]"
                  )}
                  onClick={() => setBulkStep(s => Math.min(3, s + 1) as 1 | 2 | 3)}
                >
                  Próximo <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  disabled={bulkSelected.size === 0 || bulkLoading || userCustomGroups.length === 0}
                  className={cn(
                    "flex-1 gap-2.5 h-12 rounded-xl font-black text-sm transition-all duration-300",
                    "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white",
                    "shadow-[0_8px_32px_-6px_hsl(38_92%_50%/0.5)] hover:shadow-[0_12px_40px_-4px_hsl(38_92%_50%/0.6)]",
                    "disabled:from-muted disabled:to-muted disabled:shadow-none"
                  )}
                  onClick={async () => {
                    setBulkLoading(true);
                    const ids = Array.from(bulkSelected);
                    let ok = 0;
                    let fail = 0;
                    const BATCH = 5;
                    for (let i = 0; i < ids.length; i += BATCH) {
                      const batch = ids.slice(i, i + BATCH);
                      const results = await Promise.allSettled(
                        batch.map(deviceId =>
                          engine.mutateAsync({ action: "start", device_id: deviceId, chip_state: bulkChipState, days_total: Number(bulkDaysTotal), start_day: Number(bulkStartDay) > 1 ? Number(bulkStartDay) : undefined })
                        )
                      );
                      results.forEach(r => r.status === "fulfilled" ? ok++ : fail++);
                    }
                    setBulkLoading(false);
                    setBulkOpen(false);
                    setBulkStep(1);
                    qc.invalidateQueries({ queryKey: ["warmup_cycles"] });
                    toast({
                      title: `🔥 Aquecimento iniciado em ${ok} instância(s)`,
                      description: fail > 0 ? `${fail} falharam` : undefined,
                      variant: fail > 0 ? "destructive" : undefined,
                    });
                  }}
                >
                  {bulkLoading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Flame className="w-4.5 h-4.5" />}
                  Iniciar {bulkSelected.size > 0 ? `(${bulkSelected.size})` : "aquecimento"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add instances to folder dialog */}
      {activeFolder && (
        <AddToFolderDialog
          open={addToFolderOpen}
          onOpenChange={setAddToFolderOpen}
          allDevices={filteredDevices.filter(d => !allFolderDeviceIds.has(d.id) || (activeFolder.device_ids || []).includes(d.id))}
          currentDeviceIds={activeFolder.device_ids || []}
          folderName={activeFolder.name}
          folderColor={activeFolder.color}
          onSave={async (deviceIds) => {
            const currentIds = new Set(activeFolder.device_ids || []);
            const newIds = deviceIds.filter(id => !currentIds.has(id));
            const removedIds = [...currentIds].filter(id => !deviceIds.includes(id));
            if (newIds.length > 0) {
              await addDevices.mutateAsync({ folderId: activeFolder.id, deviceIds: newIds });
            }
            for (const id of removedIds) {
              await removeDevice.mutateAsync({ folderId: activeFolder.id, deviceId: id });
            }
            toast({ title: "Pasta atualizada" });
          }}
          cycleByDeviceId={cycleByDeviceId}
        />
      )}

      {/* Tag manager dialog */}
      {activeFolder && (
        <TagManagerDialog
          open={folderDialogOpen}
          onOpenChange={setFolderDialogOpen}
          tags={activeFolder.tags || []}
          onSave={async (tags) => {
            await updateFolder.mutateAsync({ id: activeFolder.id, tags });
          }}
          folderName={activeFolder.name}
          folderColor={activeFolder.color}
        />
      )}

      {/* Device tag assignment dialog */}
      {activeFolder && deviceTagTarget && (
        <DeviceTagAssignDialog
          open={!!deviceTagTarget}
          onOpenChange={(v) => { if (!v) setDeviceTagTarget(null); }}
          availableTags={activeFolder.tags || []}
          currentTags={activeFolder.device_tags?.get(deviceTagTarget) || []}
          deviceName={displayed.find(d => d.id === deviceTagTarget)?.name || ""}
          onSave={async (tags) => {
            await updateDeviceTags.mutateAsync({ folderId: activeFolder.id, deviceId: deviceTagTarget, tags });
            setDeviceTagTarget(null);
          }}
        />
      )}
    </div>
  );
};

export default WarmupInstances;
