import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, QrCode, Link2, Pencil, Power, Trash2, Smartphone, CheckCircle2, XCircle, Loader2, Shield, RefreshCw, Key, ChevronDown, Layers, UserCircle, Camera, Search, Flame, AlertTriangle, Activity, Eye, EyeOff, Lock, WifiOff, Ban, ShieldAlert, Zap, LayoutGrid, List, Heart, RotateCcw, TestTube, Plug,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { muteAutoSync, trackDeletedDevice, getRecentlyDeletedIds, pauseKeepAlive, resumeKeepAlive } from "@/hooks/useAutoSyncDevices";
import { useNavigate } from "react-router-dom";
import { usePlanGate, type PlanState } from "@/hooks/usePlanGate";

interface Device {
  id: string;
  name: string;
  number: string;
  status: "Ready" | "Disconnected" | "Loading";
  login_type: string;
  proxy_id: string | null;
  profile_picture: string | null;
  profile_name: string | null;
  created_at: string;
  updated_at: string;
  has_api_config: boolean;
}

type FilterTab = "all" | "online" | "offline" | "error" | "warmup";

type SmartStatus = "online" | "offline";

const smartStatusConfig: Record<SmartStatus, { label: string; icon: any; badgeClass: string; tooltip: string }> = {
  online: { label: "Conectado", icon: CheckCircle2, badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", tooltip: "Instância conectada" },
  offline: { label: "Desconectado", icon: WifiOff, badgeClass: "bg-red-500/10 text-red-400 border-red-500/20", tooltip: "Instância desconectada" },
};

function deriveSmartStatus(d: Device, warmupDeviceIds: Set<string>, proxyStatus?: string): SmartStatus {
  return d.status === "Ready" ? "online" : "offline";
}

function formatPhone(num: string): string {
  const digits = num.replace(/\D/g, "");
  // Always: +CC DD XXXXX-XXXX (dash before last 4 digits)
  if (digits.length === 13) return `+${digits.slice(0,2)} ${digits.slice(2,4)} ${digits.slice(4,9)}-${digits.slice(9)}`;
  if (digits.length === 12) return `+${digits.slice(0,2)} ${digits.slice(2,4)} ${digits.slice(4,8)}-${digits.slice(8)}`;
  if (digits.length === 14) return `+${digits.slice(0,2)} ${digits.slice(2,4)} ${digits.slice(4,10)}-${digits.slice(10)}`;
  if (digits.length === 11) return `+55 ${digits.slice(0,2)} ${digits.slice(2,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `+55 ${digits.slice(0,2)} ${digits.slice(2,6)}-${digits.slice(6)}`;
  // Fallback: add country code and format with dash before last 4
  if (digits.length >= 8) {
    const last4 = digits.slice(-4);
    const rest = digits.slice(0, -4);
    return `+${rest}-${last4}`;
  }
  return num;
}

const Devices = () => {
  const { toast } = useToast();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Plan gate states
  const [planGateOpen, setPlanGateOpen] = useState(false);
  const [limitGateOpen, setLimitGateOpen] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Quick action loading states
  const [quickActionLoading, setQuickActionLoading] = useState<Record<string, string>>({});

  // Force avatar cache refresh every 5s so provider photo/name changes appear without F5
  const [avatarRefreshTick, setAvatarRefreshTick] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const interval = setInterval(() => {
      setAvatarRefreshTick(Math.floor(Date.now() / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const withAvatarRefresh = (url: string | null) => {
    if (!url) return "";
    if (url.startsWith("data:image/")) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${avatarRefreshTick}`;
  };

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [loginType, setLoginType] = useState<"qr" | "phone" | "code">("qr");
  const [instanceName, setInstanceName] = useState("");
  const [instanceToken, setInstanceToken] = useState("");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editName, setEditName] = useState("");

  // Bulk create dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState("Instância");
  const [bulkCount, setBulkCount] = useState<number | "">(1);
  const [bulkUseProxy, setBulkUseProxy] = useState(false);
  const [bulkSelectedProxies, setBulkSelectedProxies] = useState<string[]>([]);
  const [bulkNoProxyCount, setBulkNoProxyCount] = useState(0);
  const bulkTotalCount = bulkUseProxy ? bulkSelectedProxies.length : (bulkCount || 0);

  // Selection for bulk delete
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [deleteDisconnectedOpen, setDeleteDisconnectedOpen] = useState(false);
  const [deleteSingleOpen, setDeleteSingleOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [deleteSingleDevice, setDeleteSingleDevice] = useState<Device | null>(null);
  // Force delete confirmation (second stage)
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false);
  const [forceDeleteIds, setForceDeleteIds] = useState<string[]>([]);
  const [forceDeleteWarnings, setForceDeleteWarnings] = useState<string[]>([]);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditName, setInlineEditName] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp Profile dialog
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileDevice, setProfileDevice] = useState<Device | null>(null);
  const [wpName, setWpName] = useState("");
  
  const [wpPhotoUrl, setWpPhotoUrl] = useState("");
  const [wpPhotoBase64, setWpPhotoBase64] = useState("");
  const [wpRemovePhoto, setWpRemovePhoto] = useState(false);
  const [wpApplyAll, setWpApplyAll] = useState(false);
  const [wpSaving, setWpSaving] = useState(false);

  // Bulk profile update dialog
  const [bulkProfileOpen, setBulkProfileOpen] = useState(false);
  const [bulkProfileName, setBulkProfileName] = useState("");
  const [bulkProfilePhotoUrl, setBulkProfilePhotoUrl] = useState("");
  const [bulkProfilePhotoPublicUrl, setBulkProfilePhotoPublicUrl] = useState("");
  const [bulkProfileRemovePhoto, setBulkProfileRemovePhoto] = useState(false);
  const [bulkProfileSelectedIds, setBulkProfileSelectedIds] = useState<string[]>([]);
  const [bulkProfileSaving, setBulkProfileSaving] = useState(false);
  const bulkProfileFileRef = useRef<HTMLInputElement>(null);

  // Connect dialog
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectingDevice, setConnectingDevice] = useState<Device | null>(null);
  const [connectStep, setConnectStep] = useState<"choose" | "proxy" | "qr" | "code_phone" | "code" | "connecting" | "done">("proxy");
  const [codePhone, setCodePhone] = useState("");
  const [qrCodeBase64, setQrCodeBase64] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [connectError, setConnectError] = useState("");
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [qrCountdown, setQrCountdown] = useState(30);
  const qrCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch devices from database
  const { data: devices = [] } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const userId = session?.user?.id;
      if (!userId) return [];
      const [devicesRes, tokensRes] = await Promise.all([
        supabase
          .from("devices")
          .select("id, name, number, status, login_type, proxy_id, profile_picture, profile_name, created_at, updated_at, instance_type")
          .eq("user_id", userId)
          .neq("login_type", "report_wa")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
        supabase
          .from("user_api_tokens")
          .select("device_id")
          .not("device_id", "is", null)
          .eq("status", "in_use"),
      ]);
      if (devicesRes.error) throw devicesRes.error;
      const configuredDeviceIds = new Set(
        (tokensRes.data || []).map((t: any) => t.device_id)
      );
      const deletedIds = getRecentlyDeletedIds();
      return (devicesRes.data || [])
        .filter((d: any) => !deletedIds.has(d.id))
        .map((d: any) => ({
          id: d.id,
          name: d.name,
          number: d.number || "",
          status: d.status as "Ready" | "Disconnected" | "Loading",
          login_type: d.login_type,
          proxy_id: d.proxy_id,
          profile_picture: d.profile_picture || null,
          profile_name: d.profile_name || null,
          created_at: d.created_at,
          updated_at: d.updated_at,
          has_api_config: configuredDeviceIds.has(d.id),
        })) as Device[];
    },
    enabled: !!session,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  // Fetch warmup sessions to identify devices in warmup
  const { data: warmupSessions = [] } = useQuery({
    queryKey: ["warmup_sessions_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_sessions")
        .select("device_id, status")
        .in("status", ["running", "paused"]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
  });

  // Fetch warmup cycles (V2)
  const { data: warmupCycles = [] } = useQuery({
    queryKey: ["warmup_cycles_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warmup_cycles")
        .select("device_id, phase, is_running")
        .eq("is_running", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
  });

  // Fetch campaigns with active states (sending, scheduled, paused)
  const { data: activeCampaigns = [] } = useQuery({
    queryKey: ["active_campaigns_for_devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, device_id, device_ids")
        .in("status", ["sending", "scheduled", "paused", "processing"]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
  });

  const warmupDeviceIds = useMemo(() => {
    const ids = new Set(warmupSessions.map(s => s.device_id));
    warmupCycles.forEach(c => ids.add(c.device_id));
    return ids;
  }, [warmupSessions, warmupCycles]);

  // Devices with active campaigns
  const campaignDeviceIds = useMemo(() => {
    const ids = new Set<string>();
    activeCampaigns.forEach(c => {
      if (c.device_id) ids.add(c.device_id);
      if (Array.isArray(c.device_ids)) {
        (c.device_ids as string[]).forEach(id => ids.add(id));
      }
    });
    return ids;
  }, [activeCampaigns]);

  // Use shared plan gate hook instead of duplicating queries
  const { planState, isBlocked, subscription, profile, maxInstances: maxInstancesAllowed, planBadgeText } = usePlanGate();

  const canCreateInstance = planState === "active" && devices.length < maxInstancesAllowed;

  // Lightweight health score — no extra queries needed
  const deviceHealthScores = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const d of devices) {
      let score = 100;
      if (d.status === "Disconnected") score -= 20;
      if (!d.has_api_config) score -= 30;
      if (!d.proxy_id) score -= 10;
      scores[d.id] = Math.max(0, Math.min(100, score));
    }
    return scores;
  }, [devices]);

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 50) return "text-amber-500";
    return "text-red-400";
  };

  const getHealthProgressColor = (score: number) => {
    if (score >= 80) return "[&>div]:bg-emerald-500";
    if (score >= 50) return "[&>div]:bg-amber-500";
    return "[&>div]:bg-red-400";
  };

  // Auto-sync now handled globally in DashboardLayout

  // Fetch proxies from database
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

  // Helper to get proxy status for a device
  const getProxyStatus = (d: Device) => {
    if (!d.proxy_id) return undefined;
    const p = dbProxies.find(px => px.id === d.proxy_id);
    return p?.status || undefined;
  };

  // Filtered devices
  const filteredDevices = useMemo(() => {
    let list = [...devices].sort((a, b) => {
      const numA = parseInt((a.name.match(/(\d+)/) || ["0", "0"])[1], 10);
      const numB = parseInt((b.name.match(/(\d+)/) || ["0", "0"])[1], 10);
      return numA - numB;
    });
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        (d.number && d.number.includes(q)) ||
        (d.profile_name && d.profile_name.toLowerCase().includes(q))
      );
    }
    switch (activeFilter) {
      case "online": return list.filter(d => d.status === "Ready");
      case "offline": return list.filter(d => d.status === "Disconnected" && d.number);
      case "error": return list.filter(d => deriveSmartStatus(d, warmupDeviceIds, getProxyStatus(d)) === "offline");
      case "warmup": return list.filter(d => warmupDeviceIds.has(d.id));
      default: return list;
    }
  }, [devices, searchQuery, activeFilter, warmupDeviceIds, dbProxies]);

  const [selectedProxy, setSelectedProxy] = useState("");
  const [connectMethod, setConnectMethod] = useState<"qr" | "code">("qr");

  // Logout confirm dialog
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOutDevice, setLoggingOutDevice] = useState<Device | null>(null);

  // Edit proxy dialog
  const [editProxyOpen, setEditProxyOpen] = useState(false);
  const [editProxyDevice, setEditProxyDevice] = useState<Device | null>(null);
  const [editProxyValue, setEditProxyValue] = useState("");

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (device: { name: string; login_type: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-devices", {
        body: { action: "create", name: device.name, login_type: device.login_type },
      });
      if (error) {
        let realMsg = data?.error || "";
        if (!realMsg) {
          // Try to extract from FunctionsHttpError context
          try {
            const body = await error.context?.json?.();
            realMsg = body?.error || "";
          } catch {}
        }
        if (!realMsg && error.message) {
          const jsonMatch = error.message.match(/\{"error"\s*:\s*"([^"]+)"\}/);
          realMsg = jsonMatch?.[1] || error.message;
        }
        throw new Error(realMsg || "Erro ao criar instância");
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onMutate: async (device) => {
      muteAutoSync(5000);
      await queryClient.cancelQueries({ queryKey: ["devices"] });
      const previous = queryClient.getQueryData<Device[]>(["devices"]);
      const tempId = `temp-${Date.now()}`;
      queryClient.setQueryData(["devices"], (old: Device[] | undefined) => {
        if (!old) return old;
        return [...old, {
          id: tempId,
          name: device.name,
          number: "",
          status: "Disconnected" as const,
          login_type: device.login_type,
          proxy_id: null,
          profile_picture: null,
          profile_name: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          has_api_config: false,
        } as Device];
      });
      toast({ title: "Instância criada" });
      return { previous, tempId };
    },
    onSuccess: (data, _vars, context) => {
      // Replace temp device with real one
      if (data?.device && context?.tempId) {
        queryClient.setQueryData(["devices"], (old: Device[] | undefined) => {
          if (!old) return old;
          return old.map(d => d.id === context.tempId ? {
            id: data.device.id,
            name: data.device.name,
            number: data.device.number || "",
            status: data.device.status || "Disconnected",
            login_type: data.device.login_type || "qr",
            proxy_id: data.device.proxy_id || null,
            profile_picture: null,
            profile_name: null,
            created_at: data.device.created_at || new Date().toISOString(),
            updated_at: data.device.updated_at || new Date().toISOString(),
            has_api_config: data.device.has_api_config || false,
          } as Device : d);
        });
      }
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-stats"] });
    },
    onError: (err: any, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["devices"], context.previous);
      const msg = err?.message || "";
      if (msg.includes("device_limit") || msg.includes("Limite")) {
        toast({ title: `Seu plano permite apenas ${maxInstancesAllowed} instâncias`, variant: "destructive" });
      } else {
        toast({ title: "Erro ao criar instância", description: msg, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("manage-devices", {
        body: { action: "delete", deviceId: id },
      });
      if (error) throw new Error(error.message || "Erro ao excluir instância");
      if (data?.error) throw new Error(data.error);
      return { id };
    },
    onMutate: async (id: string) => {
      // Track this ID so it's filtered from all future query results
      trackDeletedDevice(id);
      muteAutoSync(30000);
      await queryClient.cancelQueries({ queryKey: ["devices"] });
      const previous = queryClient.getQueryData<Device[]>(["devices"]);
      // Find device info for the toast before removing
      const deletedDevice = previous?.find(d => d.id === id);
      queryClient.setQueryData(["devices"], (old: Device[] | undefined) =>
        old ? old.filter(d => d.id !== id) : old
      );
      // Show instant feedback toast with device name and number
      const deviceLabel = deletedDevice?.name || "Instância";
      const deviceNumber = deletedDevice?.number ? ` (${formatPhone(deletedDevice.number)})` : "";
      toast({ title: `✅ ${deviceLabel} removida`, description: deviceNumber || undefined });
      return { previous };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sidebar-stats"] });
    },
    onError: (err: any, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["devices"], context.previous);
      }
      console.error("Delete error:", err);
      toast({ title: "Erro ao apagar instância", description: err?.message || "Erro desconhecido", variant: "destructive" });
    },
    onSettled: () => {
      // Delay the invalidation to give the server time to fully delete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["devices"] });
      }, 8000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("devices").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["devices"] });
      const previous = queryClient.getQueryData<Device[]>(["devices"]);
      queryClient.setQueryData(["devices"], (old: Device[] | undefined) =>
        old ? old.map(d => d.id === id ? { ...d, ...updates } : d) : old
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["devices"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const handleCreate = () => {
    if (planState !== "active") { setPlanGateOpen(true); return; }
    if (devices.length >= maxInstancesAllowed) { setLimitGateOpen(true); return; }
    if (!instanceName.trim()) {
      toast({ title: "Informe o nome da instância", variant: "destructive" });
      return;
    }
    createMutation.mutate({ name: instanceName, login_type: loginType });
    setCreateOpen(false);
    setInstanceName("");
    setInstanceToken("");
    setLoginType("qr");
  };

  const handleBulkCreate = async () => {
    if (!bulkPrefix.trim()) {
      toast({ title: "Informe o prefixo do nome", variant: "destructive" });
      return;
    }
    // When using proxy, total = selected proxies count; otherwise total = bulkCount
    const proxyIds = bulkUseProxy ? bulkSelectedProxies : [];
    const noProxyCount = bulkUseProxy ? 0 : (bulkCount || 0);
    const totalCount = proxyIds.length + noProxyCount;
    if (totalCount === 0) {
      toast({ title: "Defina ao menos uma instância", variant: "destructive" });
      return;
    }
    if (planState !== "active") {
      setPlanGateOpen(true);
      return;
    }
    const remaining = maxInstancesAllowed - devices.length;
    if (totalCount > remaining) {
      toast({ 
        title: `Seu plano permite apenas ${maxInstancesAllowed} instância${maxInstancesAllowed !== 1 ? "s" : ""}`, 
        description: remaining > 0 
          ? `Você já possui ${devices.length} instância${devices.length !== 1 ? "s" : ""}. Só é possível criar mais ${remaining}.`
          : `Você já atingiu o limite de ${maxInstancesAllowed} instância${maxInstancesAllowed !== 1 ? "s" : ""} do seu plano.`,
        variant: "destructive" 
      });
      return;
    }
    // Optimistic: add placeholder devices immediately
    muteAutoSync(5000);
    const existingNums = devices.map(d => { const m = d.name.match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; });
    const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 0;
    const startIdx = maxNum + 1;
    const tempDevices: Device[] = Array.from({ length: totalCount }, (_, i) => ({
      id: `temp-bulk-${Date.now()}-${i}`,
      name: `${bulkPrefix} ${startIdx + i}`,
      number: "",
      status: "Disconnected" as const,
      login_type: "qr",
      proxy_id: proxyIds[i] || null,
      profile_picture: null,
      profile_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      has_api_config: false,
    }));
    queryClient.setQueryData(["devices"], (old: Device[] | undefined) =>
      old ? [...old, ...tempDevices] : tempDevices
    );
    toast({ title: `${totalCount} instância${totalCount !== 1 ? "s" : ""} criada${totalCount !== 1 ? "s" : ""}` });
    setBulkOpen(false);

    // Fire API in background
    try {
      const { data, error } = await supabase.functions.invoke("manage-devices", {
        body: {
          action: "bulk-create",
          prefix: bulkPrefix,
          proxyIds,
          noProxyCount,
          startIndex: startIdx,
        },
      });
      if (error) throw new Error(error.message || "Erro ao criar instâncias");
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (err: any) {
      const msg = err?.message || "";
      // Rollback temp devices
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      if (msg.includes("Limite") || msg.includes("LIMIT")) {
        toast({ title: "Limite de instâncias atingido", description: msg, variant: "destructive" });
      } else {
        toast({ title: "Erro ao criar instâncias", description: msg, variant: "destructive" });
      }
    }
  };

  const toggleBulkProxy = (proxyId: string) => {
    setBulkSelectedProxies(prev =>
      prev.includes(proxyId) ? prev.filter(id => id !== proxyId) : [...prev, proxyId]
    );
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const executeDelete = async (ids: string[]) => {
    const previous = queryClient.getQueryData<Device[]>(["devices"]);
    const idsSet = new Set(ids);
    queryClient.setQueryData(["devices"], (old: Device[] | undefined) =>
      old ? old.filter(d => !idsSet.has(d.id)) : old
    );
    setSelectedDevices([]);
    try {
      await Promise.allSettled(
        ids.map(id =>
          supabase.functions.invoke("manage-devices", {
            body: { action: "delete", deviceId: id },
          })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
      toast({ title: `${ids.length} instância${ids.length !== 1 ? "s" : ""} removida${ids.length !== 1 ? "s" : ""}` });
    } catch {
      if (previous) queryClient.setQueryData(["devices"], previous);
      toast({ title: "Erro ao remover instâncias", variant: "destructive" });
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    const connectedStatuses = ["Connected", "Ready", "authenticated"];

    // Classify each device
    const protectedIds: string[] = [];
    const warnings: string[] = [];
    const safeToDel: string[] = [];

    for (const id of ids) {
      const dev = devices.find(d => d.id === id);
      if (!dev) continue;

      const isConnected = connectedStatuses.includes(dev.status);
      const isWarmup = warmupDeviceIds.has(id);
      const isCampaign = campaignDeviceIds.has(id);

      if (isConnected || isWarmup || isCampaign) {
        protectedIds.push(id);
        const reasons: string[] = [];
        if (isConnected) reasons.push("conectada");
        if (isWarmup) reasons.push("em aquecimento");
        if (isCampaign) reasons.push("com campanha ativa/agendada");
        warnings.push(`${dev.name}: ${reasons.join(", ")}`);
      } else {
        safeToDel.push(id);
      }
    }

    // If there are protected devices, show force-confirm dialog
    if (protectedIds.length > 0) {
      // Delete safe ones first
      if (safeToDel.length > 0) {
        await executeDelete(safeToDel);
      }
      // Show warning for protected ones
      setForceDeleteIds(protectedIds);
      setForceDeleteWarnings(warnings);
      setForceDeleteOpen(true);
      return;
    }

    // No protected devices — delete all directly
    await executeDelete(safeToDel);
  };

  const handleForceDelete = async () => {
    setForceDeleteOpen(false);
    await executeDelete(forceDeleteIds);
    setForceDeleteIds([]);
    setForceDeleteWarnings([]);
  };

  const toggleSelectDevice = (id: string) => {
    setSelectedDevices(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Edit
  const openEdit = (device: Device) => {
    setEditingDevice(device);
    setEditName(device.name);
    setEditProxyValue(device.proxy_id || "none");
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingDevice || !editName.trim()) return;

    // Prevent only a brief overwrite while provider settles
    muteAutoSync(8_000);

    const newProxyId = editProxyValue === "none" ? null : editProxyValue;
    const dbUpdates: Record<string, any> = {
      name: editName,
      proxy_id: newProxyId,
      updated_at: new Date().toISOString(),
    };

    try {
      console.log("[edit-save] deviceId:", editingDevice.id, "wpPhotoBase64 length:", wpPhotoBase64?.length, "wpRemovePhoto:", wpRemovePhoto, "wpName:", wpName);

      // 1. Prepare DB updates for photo/name BEFORE calling API
      if (wpName.trim()) {
        dbUpdates.profile_name = wpName.trim();
      }
      if (wpRemovePhoto) {
        dbUpdates.profile_picture = null;
      } else if (wpPhotoBase64) {
        try {
          const profilePictureDbValue = wpPhotoBase64.startsWith("data:image/")
            ? await uploadProfilePhotoDraft(wpPhotoBase64)
            : wpPhotoBase64;
          dbUpdates.profile_picture = profilePictureDbValue;
        } catch {
          dbUpdates.profile_picture = wpPhotoBase64;
        }
      }

      // 2. Save to DB FIRST — instant optimistic update
      await updateMutation.mutateAsync({
        id: editingDevice.id,
        updates: dbUpdates,
      });

      // 3. Close dialog immediately — user sees changes right away
      closeEditDialog();
      toast({ title: "Instância atualizada" });

      // 4. Sync with WhatsApp in background (non-blocking)
      const deviceId = editingDevice.id;
      const bgWarnings: string[] = [];
      
      const bgSync = async () => {
        // Name sync
        if (wpName.trim()) {
          try {
            const nameResult = await callApi({ action: "updateProfileName", deviceId, profileName: wpName.trim() });
            if (isEdgeCallFailed(nameResult)) bgWarnings.push("Nome não sincronizou com WhatsApp");
          } catch { bgWarnings.push("Nome não sincronizou com WhatsApp"); }
        }
        // Photo sync
        if (wpRemovePhoto) {
          try {
            const removeResult = await tryRemoveProfilePhoto(deviceId);
            if (!removeResult.ok) bgWarnings.push("Foto não foi removida no WhatsApp");
          } catch { bgWarnings.push("Foto não foi removida no WhatsApp"); }
        } else if (wpPhotoBase64) {
          try {
            const photoPayload = dbUpdates.profile_picture || wpPhotoBase64;
            const photoResult = await callApi({ action: "updateProfilePicture", deviceId, profilePictureData: photoPayload });
            if (isEdgeCallFailed(photoResult)) {
              const apiErr = photoResult?.error || "";
              bgWarnings.push(
                apiErr.includes("not a valid image") || apiErr.includes("cannot be empty")
                  ? "A imagem não foi aceita pelo WhatsApp. Tente outra foto (JPG quadrada, mínimo 192×192px)."
                  : "Foto não sincronizou com WhatsApp"
              );
            }
          } catch { bgWarnings.push("Foto não sincronizou com WhatsApp"); }
        }
        if (bgWarnings.length > 0) {
          toast({ title: "⚠️ Aviso de sincronização", description: bgWarnings[0], variant: "warning" });
        }
      };
      bgSync(); // fire-and-forget

      return; // skip the closeEditDialog/toast below

    } catch (err: any) {
      console.error("Edit update error:", err);
      toast({
        title: "Erro ao atualizar",
        description: err?.message || "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    }
  };

  // Edit proxy
  const openEditProxy = (device: Device) => {
    setEditProxyDevice(device);
    setEditProxyValue(device.proxy_id || "none");
    setEditProxyOpen(true);
  };

  const handleEditProxy = () => {
    if (!editProxyDevice) return;
    const proxyId = editProxyValue === "none" ? null : editProxyValue;
    updateMutation.mutate({
      id: editProxyDevice.id,
      updates: { proxy_id: proxyId },
    });
    toast({ title: "Proxy atualizado" });
    setEditProxyOpen(false);
    setEditProxyDevice(null);
  };

  // Inline edit name
  const startInlineEdit = (device: Device) => {
    setInlineEditId(device.id);
    setInlineEditName(device.name);
    setTimeout(() => inlineInputRef.current?.focus(), 50);
  };

  const commitInlineEdit = () => {
    if (inlineEditId && inlineEditName.trim()) {
      updateMutation.mutate({ id: inlineEditId, updates: { name: inlineEditName.trim() } });
      toast({ title: "Nome atualizado" });
    }
    setInlineEditId(null);
  };

  // Token management is handled server-side only

  // Logout
  const openLogout = (device: Device) => {
    setLoggingOutDevice(device);
    setLogoutOpen(true);
  };

  // WhatsApp Profile edit
  const openProfileEdit = (device: Device) => {
    setProfileDevice(device);
    setWpName("");
    
    setWpPhotoUrl(device.profile_picture || "");
    setWpPhotoBase64("");
    setWpRemovePhoto(false);
    setWpApplyAll(false);
    setProfileOpen(true);
  };

  const wpFileRef = useRef<HTMLInputElement>(null);
  const [wpUploading, setWpUploading] = useState(false);

  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });

  const normalizePhotoForProvider = (dataUrl: string, maxDimension = 640, quality = 0.85) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          if (img.width < 100 || img.height < 100) {
            reject(new Error("Imagem muito pequena. Use uma foto com pelo menos 100x100 pixels."));
            return;
          }

          // WhatsApp requires square images — crop to center square then resize
          const side = Math.min(img.width, img.height);
          const sx = Math.round((img.width - side) / 2);
          const sy = Math.round((img.height - side) / 2);
          const targetSize = Math.min(side, maxDimension);

          const canvas = document.createElement("canvas");
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Falha ao processar imagem");

          ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
          const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
          if (!jpegDataUrl.startsWith("data:image/jpeg;base64,")) {
            throw new Error("Falha ao converter imagem para JPEG");
          }

          // Validate minimum base64 size (corrupt/blank images produce tiny outputs)
          const b64Part = jpegDataUrl.split(",")[1] || "";
          if (b64Part.length < 500) {
            reject(new Error("Imagem resultante muito pequena ou corrompida. Tente outra foto."));
            return;
          }

          resolve(jpegDataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Formato de imagem não suportado. Use JPG ou PNG."));
      img.src = dataUrl;
    });

  const uploadProfilePhotoDraft = async (dataUrl: string): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeMatch?.[1] || "image/jpeg";
    const base64 = dataUrl.split(",")[1];
    if (!base64) throw new Error("Imagem inválida");

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const ext = mimeType.split("/")[1] || "jpg";
    const filePath = `profile-pictures/${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(filePath, bytes, { upsert: true, contentType: mimeType });

    if (uploadError) {
      console.warn("[photo-draft] storage upload failed, falling back to data URL:", uploadError.message);
      return dataUrl;
    }
    const { data: urlData } = supabase.storage.from("media").getPublicUrl(filePath);
    return urlData.publicUrl || dataUrl;
  };

  const handleWpPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWpUploading(true);
    try {
      const previewUrl = URL.createObjectURL(file);
      const rawDataUrl = await fileToDataUrl(file);
      const safeProviderDataUrl = await normalizePhotoForProvider(rawDataUrl);
      setWpPhotoBase64(safeProviderDataUrl);
      setWpPhotoUrl(previewUrl);
      setWpRemovePhoto(false);
      // Photo preview ready silently — no toast needed
    } catch (err: any) {
      console.error("Photo draft error:", err);
      toast({ title: "Erro ao carregar foto", description: err?.message, variant: "destructive" });
    } finally {
      setWpUploading(false);
      if (wpFileRef.current) wpFileRef.current.value = "";
    }
  };

  const resetWpDraftState = () => {
    setWpPhotoUrl("");
    setWpPhotoBase64("");
    setWpRemovePhoto(false);
    if (wpFileRef.current) wpFileRef.current.value = "";
  };

  const closeEditDialog = () => {
    setEditOpen(false);
    setEditingDevice(null);
    setWpName("");
    resetWpDraftState();
  };

  const closeProfileDialog = () => {
    setProfileOpen(false);
    setProfileDevice(null);
    setWpName("");
    setWpApplyAll(false);
    resetWpDraftState();
  };

  const handleProfileUpdate = async () => {
    const hasNameChange = wpName.trim().length > 0;
    const hasPhotoChange = !!wpPhotoBase64 || wpRemovePhoto;
    if (!hasNameChange && !hasPhotoChange) {
      toast({ title: "Selecione uma foto ou preencha o nome para salvar", variant: "destructive" });
      return;
    }

    // Avoid fast reversion briefly, then let sync reconcile almost immediately
    muteAutoSync(8_000);

    setWpSaving(true);
    try {
      const connectedStatuses = ["Ready", "Connected", "authenticated", "open"];
      const targetDevices = wpApplyAll
        ? devices.filter(d => connectedStatuses.includes(d.status))
        : profileDevice ? [profileDevice] : [];
      
      console.log("[profile-update] targetDevices:", targetDevices.length, "wpApplyAll:", wpApplyAll, "profileDevice:", profileDevice?.id, profileDevice?.status);
      console.log("[profile-update] wpPhotoBase64 length:", wpPhotoBase64?.length, "wpRemovePhoto:", wpRemovePhoto, "wpName:", wpName);

      const profilePictureDbValue = wpPhotoBase64 && !wpRemovePhoto
        ? (wpPhotoBase64.startsWith("data:image/") ? await uploadProfilePhotoDraft(wpPhotoBase64) : wpPhotoBase64)
        : null;
      const profilePicturePayload = profilePictureDbValue || wpPhotoBase64;

      const results = await Promise.allSettled(
        targetDevices.map(async (device) => {
          const dbUp: Record<string, any> = {};
          const warnings: string[] = [];

          if (wpName.trim()) {
            const nameResult = await callApi({ action: "updateProfileName", deviceId: device.id, profileName: wpName.trim() });
            dbUp.profile_name = wpName.trim();
            if (isEdgeCallFailed(nameResult)) {
              warnings.push(nameResult?.error || "Falha ao sincronizar nome no WhatsApp");
            }
          }

          if (wpRemovePhoto) {
            const removeResult = await tryRemoveProfilePhoto(device.id);
            dbUp.profile_picture = null;
            if (!removeResult.ok) {
              warnings.push(removeResult.error || "Falha ao remover foto no WhatsApp");
            }
          } else if (wpPhotoBase64) {
            const photoResult = await callApi({ action: "updateProfilePicture", deviceId: device.id, profilePictureData: profilePicturePayload });
            dbUp.profile_picture = profilePictureDbValue;
            if (isEdgeCallFailed(photoResult)) {
              const apiErr = photoResult?.error || "";
              const userMsg = apiErr.includes("not a valid image") || apiErr.includes("cannot be empty")
                ? "A imagem não foi aceita pelo WhatsApp. Tente outra foto (JPG quadrada, mínimo 192x192px)."
                : (apiErr || "Falha ao sincronizar foto no WhatsApp");
              warnings.push(userMsg);
            }
          }

          if (Object.keys(dbUp).length > 0) {
            dbUp.updated_at = new Date().toISOString();
            const { error } = await supabase.from("devices").update(dbUp as any).eq("id", device.id);
            if (error) throw error;
            // Optimistic cache update
            queryClient.setQueryData(["devices"], (old: Device[] | undefined) =>
              old ? old.map(d => d.id === device.id ? { ...d, ...dbUp } : d) : old
            );
          }

          return { warnings };
        })
      );

      const failed = results.filter(r => r.status === "rejected").length;
      const warningCount = results.reduce((acc, result) => {
        if (result.status === "fulfilled") return acc + result.value.warnings.length;
        return acc;
      }, 0);

      if (failed > 0) {
        toast({ title: `Perfil atualizado (${targetDevices.length - failed}/${targetDevices.length} chips)`, description: `${failed} chip(s) falharam`, variant: "destructive" });
      } else if (warningCount > 0) {
        toast({
          title: wpApplyAll ? `Perfil salvo com ressalvas (${targetDevices.length} chips)` : "Perfil salvo com ressalva",
          description: `${warningCount} aviso(s) de sincronização no WhatsApp`,
          variant: "destructive",
        });
      } else {
        toast({ title: wpApplyAll ? `Perfil atualizado em ${targetDevices.length} chip(s)` : "Perfil atualizado" });
      }
      closeProfileDialog();
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      setTimeout(() => {
        supabase.functions.invoke("sync-devices").then(() => {
          queryClient.invalidateQueries({ queryKey: ["devices"] });
        }).catch(() => {
          queryClient.invalidateQueries({ queryKey: ["devices"] });
        });
      }, 1500);
    } catch (err: any) {
      console.error("Profile update error:", err);
      toast({ title: "Erro ao atualizar perfil", description: err?.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setWpSaving(false);
    }
  };

  // Bulk profile update handlers
  const handleBulkProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/profile-pictures/bulk-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(filePath);
      setBulkProfilePhotoPublicUrl(urlData.publicUrl);
      setBulkProfilePhotoUrl(URL.createObjectURL(file));
      setBulkProfileRemovePhoto(false);
      toast({ title: "Foto carregada" });
    } catch (err: any) {
      toast({ title: "Erro ao enviar foto", description: err?.message, variant: "destructive" });
    } finally {
      if (bulkProfileFileRef.current) bulkProfileFileRef.current.value = "";
    }
  };

  const handleBulkProfileUpdate = async () => {
    if (!bulkProfileName.trim() && !bulkProfilePhotoPublicUrl && !bulkProfileRemovePhoto) {
      toast({ title: "Preencha ao menos um campo (nome ou foto)", variant: "destructive" });
      return;
    }
    if (bulkProfileSelectedIds.length === 0) {
      toast({ title: "Selecione ao menos uma instância", variant: "destructive" });
      return;
    }

    // Avoid immediate profile rollback from sync while provider updates propagate
    muteAutoSync(45_000);

    setBulkProfileSaving(true);
    const connectedStatuses = ["Ready", "Connected", "authenticated", "open"];
    const targetDevices = devices.filter(d => bulkProfileSelectedIds.includes(d.id) && connectedStatuses.includes(d.status));
    if (targetDevices.length === 0) {
      toast({ title: "Nenhuma instância conectada selecionada", variant: "destructive" });
      setBulkProfileSaving(false);
      return;
    }
    try {
      const results = await Promise.allSettled(
        targetDevices.map(async (device) => {
          const dbUp: Record<string, any> = {};
          const warnings: string[] = [];

          if (bulkProfileName.trim()) {
            const nameResult = await callApi({ action: "updateProfileName", deviceId: device.id, profileName: bulkProfileName.trim() });
            dbUp.profile_name = bulkProfileName.trim();
            if (isEdgeCallFailed(nameResult)) {
              warnings.push(nameResult?.error || "Falha ao sincronizar nome no WhatsApp");
            }
          }

          if (bulkProfileRemovePhoto) {
            const removeResult = await tryRemoveProfilePhoto(device.id);
            dbUp.profile_picture = null;
            if (!removeResult.ok) {
              warnings.push(removeResult.error || "Falha ao remover foto no WhatsApp");
            }
          } else if (bulkProfilePhotoPublicUrl) {
            const photoResult = await callApi({ action: "updateProfilePicture", deviceId: device.id, profilePictureData: bulkProfilePhotoPublicUrl });
            dbUp.profile_picture = bulkProfilePhotoPublicUrl;
            if (isEdgeCallFailed(photoResult)) {
              warnings.push(photoResult?.error || "Falha ao sincronizar foto no WhatsApp");
            }
          }

          if (Object.keys(dbUp).length > 0) {
            dbUp.updated_at = new Date().toISOString();
            const { error } = await supabase.from("devices").update(dbUp as any).eq("id", device.id);
            if (error) throw error;
          }

          return { warnings };
        })
      );
      const failed = results.filter(r => r.status === "rejected").length;
      const warningCount = results.reduce((acc, result) => {
        if (result.status === "fulfilled") return acc + result.value.warnings.length;
        return acc;
      }, 0);

      if (failed > 0) {
        toast({ title: `Perfil atualizado (${targetDevices.length - failed}/${targetDevices.length} chips)`, description: `${failed} chip(s) falharam`, variant: "destructive" });
      } else if (warningCount > 0) {
        toast({
          title: `Perfil salvo com ressalvas (${targetDevices.length} chips)`,
          description: `${warningCount} aviso(s) de sincronização no WhatsApp`,
          variant: "destructive",
        });
      } else {
        toast({ title: `Perfil atualizado em ${targetDevices.length} chip(s)` });
      }
      setBulkProfileOpen(false);
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    } catch (err: any) {
      toast({ title: "Erro ao atualizar perfis", description: err?.message, variant: "destructive" });
    } finally {
      setBulkProfileSaving(false);
    }
  };

  const toggleBulkProfileDevice = (id: string) => {
    setBulkProfileSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const openBulkProfileDialog = () => {
    setBulkProfileName("");
    setBulkProfilePhotoUrl("");
    setBulkProfilePhotoPublicUrl("");
    setBulkProfileRemovePhoto(false);
    setBulkProfileSelectedIds([]);
    setBulkProfileSaving(false);
    setBulkProfileOpen(true);
  };

  const handleLogout = () => {
    if (!loggingOutDevice) return;
    const device = loggingOutDevice;
    // Close dialog & update UI immediately
    setLogoutOpen(false);
    setLoggingOutDevice(null);

    // Instant optimistic cache update (no await, no mutation overhead)
    queryClient.setQueryData(["devices"], (old: Device[] | undefined) =>
      old ? old.map(d => d.id === device.id ? { ...d, status: "Disconnected" as const, number: "", proxy_id: null, profile_picture: null, profile_name: null } : d) : old
    );
    toast({ title: "Desconectado", description: `${device.name} foi desconectado.` });

    // Fire everything in background (don't block UI)
    muteAutoSync(5000);
    supabase.from("devices").update({ status: "Disconnected", number: "", proxy_id: null, profile_picture: null, profile_name: null } as any).eq("id", device.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["devices"] }));
    callApi({ action: "logout", deviceId: device.id }).catch(err => console.error("Logout API error:", err));
    if (device.proxy_id) {
      supabase.from("proxies").update({ status: "USADA" } as any).eq("id", device.proxy_id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["proxies"] }));
    }
  };

  // Helper to call evolution-connect edge function with retry on 503/concurrency errors
  const callApi = async (body: Record<string, any>, maxRetries = 3): Promise<any> => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) throw new Error("Not authenticated");

    const parseEdgeError = async (err: any) => {
      let parsedBody: any = null;
      try {
        const ctx = err?.context;
        if (ctx?.json) {
          parsedBody = await ctx.json();
        } else if (ctx?.text) {
          const raw = await ctx.text();
          parsedBody = raw ? JSON.parse(raw) : null;
        }
      } catch {
        parsedBody = null;
      }

      const status = err?.status || 0;
      const code = parsedBody?.code;
      const detailedError = parsedBody?.error || parsedBody?.message;
      return { status, code, detailedError };
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await supabase.functions.invoke("evolution-connect", {
          body,
          headers: { Authorization: `Bearer ${s.access_token}` },
        });

        // Retry on concurrency/overload errors (non-2xx without meaningful data)
        if (response.error) {
          const { status, code, detailedError } = await parseEdgeError(response.error);
          const fallbackCode = code || response.data?.code;
          const fallbackError = detailedError || response.data?.error;
          const isOverload = status === 503 || status === 502 || status === 0;
          const hasNoData = !fallbackError && !fallbackCode;

          if (isOverload && hasNoData && attempt < maxRetries) {
            const delay = Math.min(1500 * Math.pow(1.5, attempt), 5000);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          return {
            error: fallbackError || response.error?.message || "Erro na Edge Function",
            code: fallbackCode,
            status,
          };
        }

        return response.data;
      } catch (invokeErr: any) {
        const { status, code, detailedError } = await parseEdgeError(invokeErr);
        const isOverload = status === 503 || status === 502 || status === 0;
        const hasNoData = !detailedError && !code;

        if (isOverload && hasNoData && attempt < maxRetries) {
          const delay = Math.min(1500 * Math.pow(1.5, attempt), 5000);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        return {
          error: detailedError || invokeErr?.message || "Erro na Edge Function",
          code,
          status,
        };
      }
    }

    return { error: "Servidor sobrecarregado. Tente novamente em instantes." };
  };

  const isEdgeCallFailed = (result: any) => Boolean(result?.error || result?.success === false);

  const callApiStrict = async (body: Record<string, any>, fallbackMessage: string) => {
    const result = await callApi(body);
    if (isEdgeCallFailed(result)) {
      throw new Error(result?.error || fallbackMessage);
    }
    return result;
  };

  const tryRemoveProfilePhoto = async (deviceId: string): Promise<{ ok: boolean; error?: string }> => {
    const result = await callApi({ action: "updateProfilePicture", deviceId, profilePictureData: "remove" });
    if (isEdgeCallFailed(result)) {
      return { ok: false, error: result?.error || "Falha ao remover foto no WhatsApp" };
    }
    return { ok: true };
  };

  // Quick actions
  const handleQuickAction = async (deviceId: string, action: "restart" | "testApi" | "testProxy") => {
    setQuickActionLoading(prev => ({ ...prev, [deviceId]: action }));
    try {
      const device = devices.find(d => d.id === deviceId);
      if (!device) return;

      if (action === "restart") {
        // Prevent duplicate clicks if already disconnected
        if (device.status === "Disconnected") return;
        // Optimistic UI update first
        queryClient.setQueryData(["devices"], (old: Device[] | undefined) =>
          old ? old.map(d => d.id === deviceId ? { ...d, status: "Disconnected", number: "", profile_picture: null, profile_name: null } : d) : old
        );
        // Fire API in background
        callApi({ action: "logout", deviceId }).catch(err => console.error("Restart logout error:", err));
        supabase.from("devices").update({ status: "Disconnected" } as any).eq("id", deviceId)
          .then(() => queryClient.invalidateQueries({ queryKey: ["devices"] }));
      } else if (action === "testApi") {
        const result = await callApi({ action: "status", deviceId });
        const status = result?.status;
        if (status === "authenticated") {
          toast({ title: "API OK", description: "Token e URL estão funcionando." });
        } else {
          toast({ title: "API com problema", description: `Status: ${status || "sem resposta"}`, variant: "destructive" });
        }
      } else if (action === "testProxy") {
        if (!device.proxy_id) {
          toast({ title: "Sem proxy", description: "Nenhuma proxy vinculada.", variant: "destructive" });
          return;
        }
        // Test by calling status through the proxy-connected device
        const result = await callApi({ action: "status", deviceId });
        if (result?.status) {
          toast({ title: "Proxy OK", description: "Conexão via proxy operacional." });
        } else {
          toast({ title: "Proxy com falha", description: "Não foi possível conectar via proxy.", variant: "destructive" });
        }
      }
    } catch (err: any) {
      toast({ title: "Erro na ação", description: err?.message || "Falha", variant: "destructive" });
    } finally {
      setQuickActionLoading(prev => { const n = { ...prev }; delete n[deviceId]; return n; });
    }
  };

  // Stop polling
  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  // QR countdown timer - auto refresh every 30s
  useEffect(() => {
    if (connectStep === "qr" && qrCodeBase64) {
      setQrCountdown(30);
      if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
      qrCountdownRef.current = setInterval(() => {
        setQrCountdown(prev => {
          if (prev <= 1) {
            // DON'T clear qrCodeBase64 — keep old QR visible while fetching new one
            if (connectingDevice) {
              callApi({ action: "refreshQr", deviceId: connectingDevice.id }).then(result => {
                if (result?.alreadyConnected) {
                  setConnectStep("done");
                  queryClient.invalidateQueries({ queryKey: ["devices"] });
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

  // Poll connection status
  const startPolling = (deviceId: string, proxyId: string | null) => {
    stopPolling();
    const interval = setInterval(async () => {
      try {
        const result = await callApi({ action: "status", deviceId });
        // Check for duplicate phone error
        if (result?.error && result?.code === "DUPLICATE_PHONE") {
          clearInterval(interval);
          setPollingInterval(null);
          setConnectError(result.error);
          setQrCodeBase64("");
          queryClient.invalidateQueries({ queryKey: ["devices"] });
          return;
        }
        const apiStatus = result?.status;
        // Status polling check
        if (apiStatus === "authenticated") {
          clearInterval(interval);
          setPollingInterval(null);
          // Mark as done FIRST, then sync in background
          setConnectStep("done");
          queryClient.invalidateQueries({ queryKey: ["devices"] });
          queryClient.invalidateQueries({ queryKey: ["proxies"] });
          toast({ title: "Conectado!", description: "Instância conectada com sucesso!" });
          // Sync in background (non-blocking)
          try {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (s) {
              await supabase.functions.invoke("sync-devices", {
                headers: { Authorization: `Bearer ${s.access_token}` },
              });
              queryClient.invalidateQueries({ queryKey: ["devices"] });
            }
          } catch (syncErr) {
            console.error("Background sync error:", syncErr);
          }
        }
      } catch (err: any) {
        console.error("Polling error:", err);
      }
    }, 3000);
    setPollingInterval(interval);
  };

  // Connect
  const openConnect = async (device: Device) => {
    if (planState !== "active") {
      setPlanGateOpen(true);
      return;
    }
    // Block connection attempts on optimistic (temp) devices that haven't been persisted yet
    if (device.id.startsWith("temp-")) {
      toast({ title: "Aguarde", description: "A instância ainda está sendo criada. Tente novamente em instantes.", variant: "destructive" });
      return;
    }
    setConnectingDevice(device);
    setConnectStep("choose");
    setQrCodeBase64("");
    setPairingCode("");
    setConnectError("");
    stopPolling();
    pauseKeepAlive(); // Pause keepAlive pings to free concurrency for connection
    setConnectOpen(true);
  };

  const handleConnect = (method: "qr" | "code") => {
    setConnectMethod(method);
    // Pre-select the proxy already assigned to the device
    setSelectedProxy(connectingDevice?.proxy_id || "none");
    setConnectStep("proxy");
  };

  const handleConfirmProxy = async () => {
    if (!connectingDevice) return;
    const proxyId = selectedProxy && selectedProxy !== "none" ? selectedProxy : null;

    const runDbUpdates = async () => {
      if (proxyId) {
        await Promise.all([
          supabase.from("devices").update({ proxy_id: proxyId } as any).eq("id", connectingDevice.id),
          supabase.from("proxies").update({ status: "USANDO" } as any).eq("id", proxyId),
        ]);
      } else if (selectedProxy === "none" && connectingDevice.proxy_id) {
        await Promise.all([
          supabase.from("devices").update({ proxy_id: null } as any).eq("id", connectingDevice.id),
          supabase.from("proxies").update({ status: "USADA" } as any).eq("id", connectingDevice.proxy_id),
        ]);
      }
      queryClient.invalidateQueries({ queryKey: ["proxies"] });
    };
    // Fire in background — don't block the API call
    runDbUpdates();

    setConnectError("");
    if (connectMethod === "code") {
      setConnectStep("code_phone");
      return;
    }
    setConnectStep(connectMethod);

    try {
      // Build proxy config: use newly selected proxy; do NOT fallback to old proxy when user chose "none"
      const selectedProxyData = proxyId ? availableProxies.find(p => p.id === proxyId) : null;
      const proxyPayload = selectedProxyData ? {
        host: selectedProxyData.host,
        port: selectedProxyData.port,
        username: selectedProxyData.username,
        password: selectedProxyData.password,
        type: selectedProxyData.type,
      } : undefined;

      // Single connect call — edge function handles everything
      const connectResult = await callApi({
        action: "connect",
        deviceId: connectingDevice.id,
        proxyConfig: proxyPayload,
        proxyId: proxyId || undefined,
      });

      // Check for any error returned by the edge function
      if (connectResult?.error) {
        setConnectError(connectResult.error);
        if (connectResult?.code === "PROXY_FAILED" || connectResult?.code === "DUPLICATE_PHONE") {
          setConnectStep("proxy");
        }
        queryClient.invalidateQueries({ queryKey: ["devices"] });
        toast({ title: "Erro de conexão", description: connectResult.error, variant: "destructive" });
        return;
      }

      if (connectResult.alreadyConnected) {
        queryClient.invalidateQueries({ queryKey: ["devices"] });
        setConnectStep("done");
        const phoneMsg = connectResult.phone ? ` Número: ${connectResult.phone}` : "";
        toast({ title: "Já conectado!", description: `Esta instância já está autenticada.${phoneMsg}` });
        setConnectOpen(false); resumeKeepAlive();
        return;
      }

      let b64 = connectResult.base64 || connectResult.qr;

      // Auto-retry: se o QR não veio na primeira resposta, tenta buscar via status até 4x
      if (!b64) {
        for (let retry = 0; retry < 4 && !b64; retry++) {
          await new Promise(r => setTimeout(r, 1200));
          const statusResult = await callApi({ action: "status", deviceId: connectingDevice.id });
          if (statusResult?.alreadyConnected || statusResult?.status === "authenticated" || statusResult?.status === "connected") {
            queryClient.invalidateQueries({ queryKey: ["devices"] });
            setConnectStep("done");
            toast({ title: "Já conectado!", description: "Instância autenticada." });
            setConnectOpen(false); resumeKeepAlive();
            return;
          }
          b64 = statusResult?.qrcode || statusResult?.base64 || statusResult?.qr;
        }
      }

      if (b64) {
        setQrCodeBase64(b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);
      } else {
        throw new Error("QR Code não retornado. Tente novamente.");
      }

      // Start polling for connection status
      startPolling(connectingDevice.id, proxyId);
    } catch (err: any) {
      console.error("Connect error:", err);
      setConnectError(err?.message || "Erro ao conectar");
      toast({ title: "Erro ao gerar QR Code", description: err?.message, variant: "destructive" });
    }
  };

  const errorCount = devices.filter(d => deriveSmartStatus(d, warmupDeviceIds, getProxyStatus(d)) === "offline").length;

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: devices.length },
    { key: "online", label: "Online", count: devices.filter(d => d.status === "Ready").length },
    { key: "offline", label: "Offline", count: devices.filter(d => d.status === "Disconnected" && d.number).length },
    { key: "error", label: "Com erro", count: errorCount },
    { key: "warmup", label: "Aquecimento", count: devices.filter(d => warmupDeviceIds.has(d.id)).length },
  ];

  const editHeaderPhoto = wpRemovePhoto ? "" : (wpPhotoUrl || editingDevice?.profile_picture || "");

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-foreground truncate">Instâncias</h1>
          <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">({devices.length}/{maxInstancesAllowed})</span>
          {planBadgeText && (
            <Badge variant="destructive" className="text-[9px] sm:text-[10px] h-4 sm:h-5 shrink-0">{planBadgeText}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {devices.filter(d => d.status === "Ready").length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8 px-3 border-border/40"
              onClick={openBulkProfileDialog}
            >
              <UserCircle className="w-3.5 h-3.5" /> Perfil em massa
            </Button>
          )}
          {selectedDevices.length > 0 && (
            <Button size="sm" variant="destructive" className="gap-1 text-xs h-7" onClick={() => setDeleteSelectedOpen(true)}>
              <Trash2 className="w-3 h-3" /> {selectedDevices.length}
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="gap-1.5 text-xs h-8 px-4" disabled={planState !== "active"}>
                        <Plus className="w-3.5 h-3.5" /> Nova instância
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => {
                        if (!canCreateInstance) { if (planState !== "active") setPlanGateOpen(true); else setLimitGateOpen(true); return; }
                        const nums = devices.map(d => { const m = d.name.match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; });
                        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
                        setInstanceName(`Instância ${next}`);
                        setCreateOpen(true);
                      }}>
                        <Plus className="w-3.5 h-3.5 mr-2" /> Criar uma
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        if (!canCreateInstance) { if (planState !== "active") setPlanGateOpen(true); else setLimitGateOpen(true); return; }
                        setBulkOpen(true); setBulkPrefix("Instância"); setBulkCount(1); setBulkUseProxy(false); setBulkSelectedProxies([]); setBulkNoProxyCount(0);
                      }}>
                        <Layers className="w-3.5 h-3.5 mr-2" /> Criar em massa
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TooltipTrigger>
              {planState !== "active" && (
                <TooltipContent><p>Ative um plano para liberar instâncias</p></TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
            disabled={syncLoading}
            onClick={async () => {
              setSyncLoading(true);
              try {
                const { data: { session: s } } = await supabase.auth.getSession();
                if (!s) throw new Error("Not authenticated");
                const response = await supabase.functions.invoke("sync-devices", {
                  headers: { Authorization: `Bearer ${s.access_token}` },
                });
                if (response.error) throw response.error;
                const result = response.data;
                const total = result.devices?.length || 0;
                const found = result.devices?.filter((d: any) => d.found).length || 0;
                queryClient.invalidateQueries({ queryKey: ["devices"] });
                queryClient.invalidateQueries({ queryKey: ["proxies"] });
                toast({ 
                  title: "✅ Sincronização concluída", 
                  description: `${found} de ${total} instância${total !== 1 ? "s" : ""} ${found !== 1 ? "encontradas" : "encontrada"} online.` 
                });
              } catch (err: any) {
                toast({ title: "Erro ao sincronizar", description: err?.message, variant: "destructive" });
              } finally {
                setSyncLoading(false);
              }
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar instância..."
            className="h-7 text-xs pl-8 bg-muted/20 border-border/20"
          />
        </div>
      </div>

      {/* Select all */}
      {filteredDevices.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedDevices.length === filteredDevices.length && filteredDevices.length > 0}
            onCheckedChange={(checked) => {
              setSelectedDevices(checked ? filteredDevices.map(d => d.id) : []);
            }}
          />
          <span className="text-[10px] text-muted-foreground/50">
            {selectedDevices.length}/{filteredDevices.length}
          </span>
        </div>
      )}

      {/* Device grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {filteredDevices.map((d) => {
          const assignedProxy = d.proxy_id ? availableProxies.find(p => p.id === d.proxy_id) : null;
          const proxyStatus = assignedProxy?.status;
          const smartStatus = deriveSmartStatus(d, warmupDeviceIds, proxyStatus);
          const ss = smartStatusConfig[smartStatus];
          const StatusIcon = ss.icon;
          const isSelected = selectedDevices.includes(d.id);
          const isEditing = inlineEditId === d.id;
          const lastActivity = formatDistanceToNow(new Date(d.updated_at || d.created_at), { locale: ptBR, addSuffix: true });
          const hadPreviousConnection = !!d.number;
          const healthScore = deviceHealthScores[d.id] ?? 100;
          const loadingAction = quickActionLoading[d.id];

          let connectionButton: React.ReactNode = null;
          if (d.status === "Ready") {
            connectionButton = (
              <Button variant="ghost" size="sm" className="h-6 gap-0.5 text-[10px] px-1.5 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => openLogout(d)}>
                <Power className="w-2.5 h-2.5" /> Desconectar
              </Button>
            );
          } else if (hadPreviousConnection) {
            connectionButton = (
              <Button size="sm" className="h-6 gap-0.5 text-[10px] px-1.5" onClick={() => openConnect(d)}>
                <RefreshCw className="w-2.5 h-2.5" /> Reconectar
              </Button>
            );
          } else {
            connectionButton = (
              <Button size="sm" className="h-6 gap-0.5 text-[10px] px-1.5" onClick={() => openConnect(d)}>
                <Link2 className="w-2.5 h-2.5" /> Conectar
              </Button>
            );
          }

          return (
            <div
              key={d.id}
              className={cn(
                "group relative rounded-2xl border overflow-hidden transition-all duration-150",
                "bg-card shadow-sm hover:shadow-lg",
                smartStatus === 'online'
                  ? "border-primary/15 hover:border-primary/30 hover:shadow-primary/5"
                  : "border-border/30 hover:border-border/50"
              )}
            >
              {/* Top accent line */}
              <div className={cn(
                "h-[2px] w-full",
                smartStatus === 'online' ? "bg-primary/60" : "bg-border/30"
              )} />

              {/* Status badge */}
              <div className="px-4 pt-3.5">
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest",
                  smartStatus === 'online' ? "text-primary bg-primary/8" : "text-muted-foreground bg-muted/30"
                )}>
                  <span className={cn(
                    "w-[5px] h-[5px] rounded-full shrink-0",
                    smartStatus === 'online' ? "bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" : "bg-muted-foreground/40"
                  )} />
                  {ss.label.toUpperCase()}
                </div>
              </div>

              {/* Avatar + Info */}
              <div className="px-4 pt-5 pb-3 flex items-center gap-4">
                <div className={cn(
                  "w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0",
                  "ring-[2.5px] ring-offset-2 ring-offset-card",
                  smartStatus === 'online' ? "ring-primary/40" : "ring-border/30"
                )}>
                  {d.profile_picture ? (
                    <img
                      src={withAvatarRefresh(d.profile_picture)}
                      className="w-[52px] h-[52px] rounded-full object-cover"
                      alt={d.name}
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                        const fallback = img.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className={cn(
                      "w-[52px] h-[52px] rounded-full flex items-center justify-center",
                      smartStatus === 'online' ? "bg-primary/8" : "bg-muted/30"
                    )}
                    style={{ display: d.profile_picture ? 'none' : 'flex' }}
                  >
                    <Smartphone className={cn("w-5 h-5", smartStatus === 'online' ? "text-primary" : "text-muted-foreground/40")} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className="text-[15px] font-bold text-foreground truncate leading-tight"
                    title={d.name}
                  >
                    {d.name}
                  </p>
                  {d.number && (
                    <p className="text-[11px] font-mono text-muted-foreground mt-1 tracking-wide">
                      {formatPhone(d.number)}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    ID: {(() => { const m = d.name.match(/(\d+)/); return m ? m[1] : devices.indexOf(d) + 1; })()}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 space-y-2">
                {d.status === "Ready" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-[11px] h-9 gap-1.5 rounded-lg font-semibold border-destructive/20 text-destructive hover:bg-destructive/8"
                    onClick={() => openLogout(d)}
                  >
                    <Power className="w-3.5 h-3.5" /> Desconectar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="w-full text-[11px] h-9 gap-1.5 rounded-lg font-semibold"
                    onClick={() => openConnect(d)}
                  >
                    {hadPreviousConnection ? <RefreshCw className="w-3.5 h-3.5" /> : <Plug className="w-3.5 h-3.5" />}
                    {hadPreviousConnection ? "Reconectar" : "Conectar"}
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[11px] h-9 gap-1.5 rounded-lg font-semibold border-border/30"
                    onClick={() => {
                      setEditingDevice(d);
                      setEditName(d.name);
                      setEditProxyValue(d.proxy_id || "none");
                      setWpName("");
                      setWpPhotoUrl(d.profile_picture || "");
                      setWpPhotoBase64("");
                      setWpRemovePhoto(false);
                      setEditOpen(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[11px] h-9 gap-1.5 rounded-lg font-semibold border-destructive/20 text-destructive hover:bg-destructive/8"
                    onClick={() => {
                      if (d.status === "Ready") {
                        setDeleteSingleDevice(d);
                        setDeleteSingleOpen(true);
                      } else {
                        handleDelete(d.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredDevices.length === 0 && devices.length > 0 && (
        <p className="text-xs text-muted-foreground/40 text-center py-8">Nenhuma instância encontrada</p>
      )}

      {devices.length === 0 && (
        <div className="text-center py-12">
          <Smartphone className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground/40">Nenhuma instância criada</p>
        </div>
      )}

      {/* Create Instance Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
          <div className="relative px-6 pt-6 pb-4 border-b border-border/20">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Plus className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Nova instância</DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">Crie uma nova conexão WhatsApp</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground font-medium">Nome da instância</Label>
              <Input
                value={instanceName}
                onChange={e => setInstanceName(e.target.value)}
                placeholder="Ex: Chip 01"
                className="h-11 text-sm rounded-xl"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button className="flex-1 h-11 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleCreate} disabled={!instanceName.trim()}>Criar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) closeEditDialog(); else setEditOpen(true); }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/40 bg-card">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-border/20">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-4">
              {editHeaderPhoto ? (
                <img src={editHeaderPhoto} alt="" className="w-12 h-12 rounded-2xl object-cover ring-2 ring-primary/20 shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold truncate text-foreground">Editar instância</DialogTitle>
                {editingDevice && (
                  <p className="text-[13px] text-muted-foreground mt-0.5 truncate">
                    {editingDevice.profile_name || editingDevice.name}
                    {editingDevice.number ? ` · ${formatPhone(editingDevice.number)}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Nome da instância */}
            <div className="space-y-2">
              <Label className="text-sm text-foreground font-semibold">Nome da instância</Label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value.slice(0, 30))}
                placeholder="Ex: Chip 01"
                className="h-11 text-sm font-medium rounded-xl bg-background border-border/50 focus:border-primary/60 text-foreground placeholder:text-muted-foreground/60 transition-colors"
                maxLength={30}
              />
              <div className="flex items-center justify-between">
                <div>
                  {editName.trim() && devices.some(d => d.name.toLowerCase() === editName.trim().toLowerCase() && d.id !== editingDevice?.id) && (
                    <span className="text-[11px] text-amber-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Nome já em uso
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-foreground/50 tabular-nums">{editName.length}/30</span>
              </div>
            </div>

            {editingDevice?.status === "Ready" && (
              <div className="space-y-4 rounded-xl border border-border/30 bg-background/50 p-4">
                <p className="text-[11px] text-foreground/60 uppercase tracking-[0.15em] font-bold">Perfil do WhatsApp</p>

                {/* Nome do WhatsApp */}
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground font-semibold flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-primary" /> Nome exibido
                  </Label>
                  <Input
                    value={wpName}
                    onChange={e => setWpName(e.target.value)}
                    placeholder={editingDevice?.profile_name || "Nome no WhatsApp"}
                    className="h-11 text-sm font-medium rounded-xl bg-background border-border/50 focus:border-primary/60 text-foreground placeholder:text-muted-foreground/60 transition-colors"
                    maxLength={25}
                  />
                  <p className="text-[11px] text-foreground/50 tabular-nums">{wpName.length}/25 caracteres</p>
                </div>

                {/* Foto do WhatsApp */}
                <div className="space-y-2">
                  <Label className="text-sm text-foreground font-semibold flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-primary" /> Foto do perfil
                  </Label>
                  <input ref={wpFileRef} type="file" accept="image/*" className="hidden" onChange={handleWpPhotoUpload} />
                  <div className="flex flex-col items-center gap-3 py-2">
                    {wpPhotoUrl && !wpRemovePhoto ? (
                      <>
                        <img src={wpPhotoUrl} alt="Foto" className="w-20 h-20 rounded-full object-cover ring-[3px] ring-primary/30 shadow-lg" />
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 text-xs font-semibold rounded-lg border-border/50" onClick={() => wpFileRef.current?.click()}>
                            <Camera className="w-3.5 h-3.5" /> Trocar foto
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 text-xs font-semibold rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => { setWpPhotoUrl(""); setWpPhotoBase64(""); setWpRemovePhoto(true); }}>
                            <XCircle className="w-3.5 h-3.5" /> Remover
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div
                        className="w-20 h-20 rounded-full border-2 border-dashed border-border/60 flex flex-col items-center justify-center hover:border-primary/50 transition-colors cursor-pointer"
                        onClick={() => wpFileRef.current?.click()}
                      >
                        <Camera className="w-6 h-6 text-foreground/40 mb-1" />
                        <span className="text-[11px] text-foreground/50 font-semibold">
                          {wpRemovePhoto ? "Removida" : "Escolher"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold border-border/40 text-foreground" onClick={closeEditDialog}>Cancelar</Button>
              <Button className="flex-1 h-11 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20" onClick={handleEdit} disabled={!editName.trim()}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Token management is handled automatically via admin panel */}

      {/* Logout Confirm Dialog */}
      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desconectar instância</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja desconectar <span className="font-medium text-foreground">{loggingOutDevice?.name}</span>? O número será desvinculado e você precisará reconectar.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoutOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleLogout}>Desconectar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectOpen} onOpenChange={(open) => {
        if (!open) { stopPolling(); setConnectStep("proxy"); setConnectOpen(false); resumeKeepAlive(); }
      }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-border/20">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${connectStep === "done" ? "bg-emerald-500/15" : "bg-primary/10"}`}>
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
                    {connectingDevice.name}{connectingDevice.number ? ` · ${formatPhone(connectingDevice.number)}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 pt-5 overflow-hidden">
           <AnimatePresence mode="wait">
            {connectStep === "choose" && (
              <motion.div key="choose" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: "easeOut" }} className="space-y-5">
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
              <motion.div key="proxy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: "easeOut" }} className="space-y-5">
                {/* Header */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground">Configurar proxy</p>
                    <p className="text-xs text-muted-foreground">Proteja sua conexão com um proxy <span className="text-muted-foreground/50">(opcional)</span></p>
                  </div>
                </div>

                {/* Proxy selector */}
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
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-semibold ${cls}`}>{p.status}</Badge>
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

                {/* Buttons */}
                <div className="flex items-center gap-3">
                  <Button variant="outline" className="flex-1 h-11 text-sm" onClick={() => { stopPolling(); setConnectStep("proxy"); setConnectOpen(false); resumeKeepAlive(); }}>
                    Cancelar
                  </Button>
                  <Button className="flex-1 h-11 text-sm font-semibold" onClick={handleConfirmProxy}>
                    Conectar
                  </Button>
                </div>
              </motion.div>
            )}

            {connectStep === "qr" && (
              <motion.div key="qr" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3, ease: "easeOut" }} className="flex flex-col items-center gap-5">
                {/* QR Code display */}
                <div className="relative w-[272px] h-[272px]">
                  {/* Loading state */}
                  <div
                    className={`absolute inset-0 w-64 h-64 m-auto rounded-2xl flex flex-col items-center justify-center border border-primary/20 bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden transition-all duration-500 ease-out ${
                      !qrCodeBase64 && !connectError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                    }`}
                  >
                    <div
                      className="absolute left-4 right-4 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent rounded-full"
                      style={{ animation: "scanLine 2.5s ease-in-out infinite" }}
                    />
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4" style={{ animation: "qrPulse 2s ease-in-out infinite" }}>
                      <QrCode className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Gerando QR Code...</p>
                    <p className="text-xs text-muted-foreground/50 mt-1">Aguarde alguns segundos</p>
                  </div>

                  {/* Error state */}
                  <div
                    className={`absolute inset-0 w-64 h-64 m-auto bg-destructive/5 rounded-2xl flex flex-col items-center justify-center border-2 border-destructive/20 p-6 transition-all duration-500 ease-out ${
                      connectError ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                    }`}
                  >
                    <XCircle className="w-10 h-10 text-destructive mb-3" />
                    <p className="text-sm text-destructive text-center leading-relaxed">{connectError}</p>
                  </div>

                  {/* QR Code */}
                  <div
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out ${
                      qrCodeBase64 ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                    }`}
                  >
                    <div className="relative p-4 rounded-2xl bg-white dark:bg-white shadow-lg">
                      <img src={qrCodeBase64} alt="QR Code" className="w-64 h-64 rounded-lg transition-opacity duration-300" />
                      {/* Countdown overlay */}
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

                {/* Instructions */}
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

                {/* Sync button */}
                <Button
                  variant="outline"
                  className="gap-2 h-9 text-sm w-full"
                  onClick={async () => {
                    try {
                      const result = await callApi({ action: "status", deviceId: connectingDevice!.id });
                      const state = result?.status;
                      if (state === "authenticated") {
                        stopPolling();
                        setConnectStep("done");
                        queryClient.invalidateQueries({ queryKey: ["devices"] });
                        toast({ title: "Conectado!" });
                        try {
                          const { data: { session: s } } = await supabase.auth.getSession();
                          if (s) {
                            await supabase.functions.invoke("sync-devices", { headers: { Authorization: `Bearer ${s.access_token}` } });
                            queryClient.invalidateQueries({ queryKey: ["devices"] });
                          }
                        } catch {}
                      } else {
                        toast({ 
                          title: "⏳ QR Code ainda não foi escaneado", 
                          description: "Escaneie o QR Code acima e aguarde a conexão.",
                        });
                      }
                    } catch (err: any) {
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
                  if (!connectingDevice.has_api_config) {
                    toast({ title: "Sem token configurado", description: "Solicite ao administrador a atribuição de um token.", variant: "destructive" });
                    return;
                  }
                  const pd = connectingDevice.proxy_id ? availableProxies.find(p => p.id === connectingDevice.proxy_id) : null;
                  const pp = pd ? { host: pd.host, port: pd.port, username: pd.username, password: pd.password, type: pd.type } : undefined;
                  const result = await callApi({ action: "requestPairingCode", deviceId: connectingDevice.id, phoneNumber: rawDigits, proxyConfig: pp, proxyId: connectingDevice.proxy_id || undefined });
                  console.log("[PairingCode] Result:", JSON.stringify(result));
                  if (result?.error && result?.code === "PROXY_FAILED") {
                    setConnectError(result.error);
                    setConnectStep("proxy");
                    queryClient.invalidateQueries({ queryKey: ["proxies"] });
                    toast({ title: "Proxy inválida", description: result.error, variant: "destructive" });
                    return;
                  }
                  if (result.alreadyConnected) { setConnectStep("done"); toast({ title: "Já conectado!" }); return; }
                  const code = result.pairingCode || result.pairing_code;
                  if (code) { setPairingCode(code); startPolling(connectingDevice.id, null); }
                  else if (result.suggestQr) { toast({ title: "Código não suportado", description: "Use o QR Code.", variant: "destructive" }); setConnectStep("qr"); if (result.qrCode) setQrCodeBase64(result.qrCode); startPolling(connectingDevice.id, null); }
                  else { toast({ title: "Código não disponível", description: "Conecte via QR Code.", variant: "destructive" }); setConnectStep("qr"); startPolling(connectingDevice.id, null); }
                } catch {
                  toast({ title: "Código não disponível", description: "Conecte via QR Code.", variant: "destructive" });
                  setConnectStep("qr");
                  if (connectingDevice) startPolling(connectingDevice.id, null);
                }
              };
              return (
              <motion.div key="code_phone" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: "easeOut" }} className="space-y-5">
                {/* Icon + instruction */}
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground">Conectar via código</p>
                    <p className="text-xs text-muted-foreground">Insira o número completo com código do país</p>
                  </div>
                </div>

                {/* Phone input */}
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
                    <span>Ex:</span>
                    <span className="font-mono">+55 63 91234-5678</span>
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-3">
                  <Button variant="outline" className="flex-1 h-11 text-sm" onClick={() => setConnectStep("proxy")}>
                    Voltar
                  </Button>
                  <Button
                    className="flex-1 h-11 text-sm font-semibold"
                    disabled={!isValid}
                    onClick={handleRequestCode}
                  >
                    Gerar código
                  </Button>
                </div>
              </motion.div>
              );
            })()}

            {connectStep === "code" && (
              <motion.div key="code" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3, ease: "easeOut" }} className="flex flex-col items-center gap-5">
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

            {connectStep === "connecting" && (
              <motion.div key="connecting" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25 }} className="flex flex-col items-center gap-4 py-10">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-sm font-medium text-muted-foreground">Conectando...</p>
              </motion.div>
            )}

            {connectStep === "done" && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: "easeOut" }} className="flex flex-col items-center gap-5 py-8">
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">Conectado com sucesso!</p>
                  <p className="text-sm text-muted-foreground mt-1">Sua instância está pronta para uso</p>
                </div>
                <Button className="h-10 px-8" onClick={() => { stopPolling(); setConnectStep("proxy"); setConnectOpen(false); resumeKeepAlive(); }}>Fechar</Button>
              </motion.div>
            )}
           </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk create dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-[460px] p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-[15px] font-semibold tracking-tight">Criar instâncias</DialogTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">Configure e crie múltiplas instâncias de uma vez</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* 1. Nome */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">Prefixo do nome</Label>
              <Input
                value={bulkPrefix}
                onChange={e => setBulkPrefix(e.target.value)}
                placeholder="Ex: Instância"
                className="h-10 text-sm"
              />
              <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                <span>→</span> {bulkPrefix} 1, {bulkPrefix} 2, {bulkPrefix} 3...
              </p>
            </div>

            {/* 2. Quantidade */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-foreground">Quantidade</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={Math.max(1, maxInstancesAllowed - devices.length)}
                  value={bulkCount || ""}
                  placeholder="1"
                  onChange={e => {
                    const remaining = Math.max(1, maxInstancesAllowed - devices.length);
                    const raw = e.target.value;
                    if (raw === "") { setBulkCount(""); return; }
                    const parsed = parseInt(raw);
                    if (isNaN(parsed)) return;
                    setBulkCount(Math.min(remaining, Math.max(1, parsed)));
                  }}
                  className="h-10 w-20 text-sm text-center"
                />
                <div className="flex-1 text-[11px] text-muted-foreground/50">
                  <span className="text-foreground/70 font-medium">{Math.max(0, maxInstancesAllowed - devices.length)}</span> disponíveis de {maxInstancesAllowed}
                </div>
              </div>
            </div>

            {/* 3. Proxy toggle */}
            <div className="rounded-xl border border-border/30 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Shield className="h-4 w-4 text-primary/70" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Vincular proxy</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">Atribuir proxies automaticamente</p>
                  </div>
                </div>
                <Switch
                  checked={bulkUseProxy}
                  onCheckedChange={(checked) => {
                    setBulkUseProxy(checked);
                    if (!checked) setBulkSelectedProxies([]);
                  }}
                />
              </div>

              {/* 4. Proxy list */}
              {bulkUseProxy && (
                <div className="border-t border-border/20 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Proxies disponíveis</span>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                      {bulkSelectedProxies.length} selecionada{bulkSelectedProxies.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="max-h-[180px] overflow-y-auto space-y-1 rounded-lg bg-muted/5 p-1.5">
                    {availableProxies.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-4">Nenhuma proxy disponível</p>
                    ) : (
                      <>
                        <div
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => {
                            if (bulkSelectedProxies.length === availableProxies.length) {
                              setBulkSelectedProxies([]);
                            } else {
                              setBulkSelectedProxies(availableProxies.map(p => p.id));
                            }
                          }}
                        >
                          <Checkbox checked={bulkSelectedProxies.length === availableProxies.length && availableProxies.length > 0} />
                          <span className="text-xs font-medium">Selecionar todas</span>
                        </div>
                        {availableProxies.map(p => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={() => toggleBulkProxy(p.id)}
                          >
                            <Checkbox checked={bulkSelectedProxies.includes(p.id)} />
                            <span className="text-xs font-mono text-muted-foreground">{p.label}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/40">
                    Cada proxy selecionada cria 1 instância automaticamente
                  </p>
                </div>
              )}
            </div>

            {/* Summary */}
            {bulkTotalCount > 0 && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/15">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {bulkTotalCount} instância{bulkTotalCount !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {bulkUseProxy ? `${bulkSelectedProxies.length} com proxy vinculada` : "Sem proxy vinculada"}
                    </p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Smartphone className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border/30 flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setBulkOpen(false)} className="h-10 px-5 text-sm">
              Cancelar
            </Button>
            <Button onClick={handleBulkCreate} disabled={bulkTotalCount === 0} className="h-10 px-6 text-sm font-medium gap-2">
              <Plus className="h-4 w-4" />
              Criar {bulkTotalCount} instância{bulkTotalCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete selected confirmation */}
      <AlertDialog open={deleteSelectedOpen} onOpenChange={setDeleteSelectedOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Apagar instâncias selecionadas</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja apagar {selectedDevices.length} instância{selectedDevices.length !== 1 ? "s" : ""}? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleBulkDelete(selectedDevices)}>
              Apagar {selectedDevices.length}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all confirmation */}
      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Apagar todas as instâncias</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja apagar todas as {devices.length} instâncias? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleBulkDelete(devices.map(d => d.id))}>
              Apagar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete disconnected confirmation */}
      <AlertDialog open={deleteDisconnectedOpen} onOpenChange={setDeleteDisconnectedOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Apagar instâncias desconectadas</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja apagar {devices.filter(d => d.status === "Disconnected").length} instância{devices.filter(d => d.status === "Disconnected").length !== 1 ? "s" : ""} desconectada{devices.filter(d => d.status === "Disconnected").length !== 1 ? "s" : ""}? As instâncias restantes serão renumeradas automaticamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => handleBulkDelete(devices.filter(d => d.status === "Disconnected").map(d => d.id))}>
              Apagar desconectadas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete single connected device confirmation */}
      <AlertDialog open={deleteSingleOpen} onOpenChange={setDeleteSingleOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Instância conectada</AlertDialogTitle>
            <AlertDialogDescription>Esta instância está conectada. Tem certeza que deseja apagá-la?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (deleteSingleDevice) handleDelete(deleteSingleDevice.id); setDeleteSingleDevice(null); }}>
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force delete confirmation (second stage) */}
      <AlertDialog open={forceDeleteOpen} onOpenChange={setForceDeleteOpen}>
        <AlertDialogContent className="bg-card border-border max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Atenção: Instâncias protegidas
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  As seguintes instâncias possuem processos ativos e foram protegidas automaticamente:
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                  {forceDeleteWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                      <span className="text-foreground/80">{w}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-destructive font-medium">
                  Apagar essas instâncias pode interromper aquecimentos em andamento, campanhas agendadas ou disparos ativos. Deseja continuar mesmo assim?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setForceDeleteIds([]); setForceDeleteWarnings([]); }}>
              Manter protegidas
            </AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleForceDelete}>
              Apagar mesmo assim ({forceDeleteIds.length})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={profileOpen} onOpenChange={(open) => { if (!open) closeProfileDialog(); else setProfileOpen(true); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5 text-primary" />
              Perfil do WhatsApp
            </DialogTitle>
            <DialogDescription>
              Altere o nome, recado e foto do perfil de <span className="font-medium text-foreground">{profileDevice?.number || profileDevice?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <UserCircle className="w-3.5 h-3.5" /> Nome do perfil
              </Label>
              <Input
                value={wpName}
                onChange={e => setWpName(e.target.value)}
                placeholder="Nome exibido no WhatsApp"
                className="h-9 text-sm"
                maxLength={25}
              />
              <p className="text-[10px] text-muted-foreground">{wpName.length}/25 caracteres</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" /> Foto do perfil
              </Label>
              <input ref={wpFileRef} type="file" accept="image/*" className="hidden" onChange={handleWpPhotoUpload} />
              <div className="flex justify-center">
                <div
                  className="relative group cursor-pointer"
                  onClick={() => {
                    if (!wpPhotoUrl && !wpRemovePhoto) wpFileRef.current?.click();
                  }}
                >
                  {wpPhotoUrl && !wpRemovePhoto ? (
                    <>
                      <img
                        src={wpPhotoUrl}
                        alt="Foto do perfil"
                        className="w-20 h-20 rounded-full object-cover border-2 border-border"
                        onError={e => { e.currentTarget.src = ""; setWpPhotoUrl(""); setWpPhotoBase64(""); }}
                      />
                      <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white hover:bg-white/20"
                          onClick={(e) => { e.stopPropagation(); wpFileRef.current?.click(); }}
                          title="Trocar foto"
                        >
                          <Camera className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white hover:bg-destructive/40"
                          onClick={(e) => { e.stopPropagation(); setWpPhotoUrl(""); setWpPhotoBase64(""); setWpRemovePhoto(true); }}
                          title="Remover foto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  ) : wpRemovePhoto ? (
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-destructive/40 flex flex-col items-center justify-center gap-1">
                      <Trash2 className="w-5 h-5 text-destructive/60" />
                      <span className="text-[9px] text-destructive/60">Remover</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute -bottom-1 text-[9px] h-5 px-2"
                        onClick={(e) => { e.stopPropagation(); setWpRemovePhoto(false); }}
                      >
                        Desfazer
                      </Button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 hover:border-primary/50 transition-colors">
                      {wpUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <Camera className="w-5 h-5 text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground">Importar</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Checkbox checked={wpApplyAll} onCheckedChange={(v) => setWpApplyAll(!!v)} />
              <div>
                <p className="text-xs font-medium">Aplicar para todos os chips conectados</p>
                <p className="text-[10px] text-muted-foreground">Altera o perfil de todas as instâncias online</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeProfileDialog} disabled={wpSaving}>Cancelar</Button>
            <Button onClick={handleProfileUpdate} disabled={wpSaving} className="bg-primary hover:bg-primary/90">
              {wpSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Gate Modal */}
      <Dialog open={planGateOpen} onOpenChange={setPlanGateOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban size={18} className="text-destructive" /> Funcionalidade bloqueada</DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              Sua conta está {planState === "noPlan" ? "sem plano ativo" : planState === "expired" ? "com plano vencido" : "suspensa/cancelada"}. Ative ou renove seu plano para liberar todas as funcionalidades (criar instâncias, conectar, disparar campanhas, aquecimento, etc).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPlanGateOpen(false)} className="border-border">Cancelar</Button>
            <Button onClick={() => { setPlanGateOpen(false); navigate("/dashboard/my-plan"); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">Ver planos / Ativar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Limit Gate Modal */}
      <Dialog open={limitGateOpen} onOpenChange={setLimitGateOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-500" /> Limite atingido</DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              Você atingiu o limite de <strong className="text-foreground">{maxInstancesAllowed}</strong> instâncias do seu plano <strong className="text-foreground">{subscription?.plan_name}</strong>. Faça upgrade para liberar mais.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLimitGateOpen(false)} className="border-border">Cancelar</Button>
            <Button onClick={() => { setLimitGateOpen(false); navigate("/dashboard/my-plan"); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">Fazer upgrade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Bulk Profile Update Dialog */}
      <Dialog open={bulkProfileOpen} onOpenChange={setBulkProfileOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-border/40 bg-card max-h-[90vh] flex flex-col">
          <div className="relative px-6 pt-6 pb-4 border-b border-border/20 shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <UserCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">Atualizar perfil em massa</DialogTitle>
                <p className="text-[13px] text-muted-foreground mt-0.5">Altere nome e foto de várias instâncias</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground font-semibold flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-primary" /> Nome exibido no WhatsApp
              </Label>
              <Input
                value={bulkProfileName}
                onChange={e => setBulkProfileName(e.target.value)}
                placeholder="Ex: Equipe de Suporte"
                className="h-11 text-sm font-medium rounded-xl bg-background border-border/50 focus:border-primary/60 text-foreground"
                maxLength={25}
              />
              <p className="text-[11px] text-foreground/50 tabular-nums">{bulkProfileName.length}/25 caracteres</p>
            </div>

            {/* Photo */}
            <div className="space-y-2">
              <Label className="text-sm text-foreground font-semibold flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-primary" /> Foto do perfil
              </Label>
              <input ref={bulkProfileFileRef} type="file" accept="image/*" className="hidden" onChange={handleBulkProfilePhotoUpload} />
              <div className="flex flex-col items-center gap-3 py-2">
                {bulkProfilePhotoUrl && !bulkProfileRemovePhoto ? (
                  <>
                    <img src={bulkProfilePhotoUrl} alt="Foto" className="w-20 h-20 rounded-full object-cover ring-[3px] ring-primary/30 shadow-lg" />
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 text-xs font-semibold rounded-lg border-border/50" onClick={() => bulkProfileFileRef.current?.click()}>
                        <Camera className="w-3.5 h-3.5" /> Trocar
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5 text-xs font-semibold rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => { setBulkProfilePhotoUrl(""); setBulkProfilePhotoPublicUrl(""); setBulkProfileRemovePhoto(true); }}>
                        <XCircle className="w-3.5 h-3.5" /> Remover
                      </Button>
                    </div>
                  </>
                ) : (
                  <div
                    className="w-20 h-20 rounded-full border-2 border-dashed border-border/60 flex flex-col items-center justify-center hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => bulkProfileFileRef.current?.click()}
                  >
                    <Camera className="w-6 h-6 text-foreground/40 mb-1" />
                    <span className="text-[11px] text-foreground/50 font-semibold">
                      {bulkProfileRemovePhoto ? "Removida" : "Escolher"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Instance selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-foreground font-semibold">Instâncias</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setBulkProfileSelectedIds(devices.filter(d => d.status === "Ready").map(d => d.id))}
                  >
                    Todas online
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setBulkProfileSelectedIds([])}
                  >
                    Limpar
                  </Button>
                </div>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-xl border border-border/30 bg-background/50 p-2">
                {devices.filter(d => d.status === "Ready").sort((a, b) => {
                  const numA = parseInt((a.name.match(/\d+/) || ["0"])[0], 10);
                  const numB = parseInt((b.name.match(/\d+/) || ["0"])[0], 10);
                  return numA - numB || a.name.localeCompare(b.name);
                }).map(d => (
                  <label
                    key={d.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      bulkProfileSelectedIds.includes(d.id) ? "bg-primary/8" : "hover:bg-muted/30"
                    )}
                  >
                    <Checkbox
                      checked={bulkProfileSelectedIds.includes(d.id)}
                      onCheckedChange={() => toggleBulkProfileDevice(d.id)}
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {d.profile_picture ? (
                        <img src={withAvatarRefresh(d.profile_picture)} className="w-7 h-7 rounded-full object-cover shrink-0" alt="" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-muted/30 flex items-center justify-center shrink-0">
                          <Smartphone className="w-3.5 h-3.5 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{d.name}</p>
                        {d.number && <p className="text-[10px] text-muted-foreground font-mono">{formatPhone(d.number)}</p>}
                      </div>
                    </div>
                  </label>
                ))}
                {devices.filter(d => d.status === "Ready").length === 0 && (
                  <p className="text-xs text-muted-foreground/50 text-center py-4">Nenhuma instância conectada</p>
                )}
              </div>
              <p className="text-[11px] text-foreground/50">
                {bulkProfileSelectedIds.length} de {devices.filter(d => d.status === "Ready").length} instância(s) selecionada(s)
              </p>
            </div>
          </div>

          <div className="px-6 pb-5 pt-2 flex items-center gap-3 border-t border-border/20 shrink-0">
            <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold border-border/40 text-foreground" onClick={() => setBulkProfileOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 h-11 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
              onClick={handleBulkProfileUpdate}
              disabled={bulkProfileSaving || bulkProfileSelectedIds.length === 0}
            >
              {bulkProfileSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {bulkProfileSaving ? "Atualizando..." : `Aplicar em ${bulkProfileSelectedIds.length} chip(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Devices;
