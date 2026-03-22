import { useState, useMemo } from "react";
import { useFeatureControls, type FeatureControl } from "@/hooks/useFeatureControls";
import {
  LayoutDashboard, Smartphone, Send, Megaphone, BookUser, FileText,
  Shield, BotMessageSquare, Flame, SaveAll, UsersRound, ScrollText,
  Settings, CreditCard, Search, CheckCircle2, Wrench, Lock, Eye,
  Loader2, ToggleLeft, ToggleRight, Pencil, RotateCcw, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MaintenanceModal } from "@/components/MaintenanceModal";
import { motion, AnimatePresence } from "framer-motion";

const ICON_MAP: Record<string, any> = {
  LayoutDashboard, Smartphone, Send, Megaphone, BookUser, FileText,
  Shield, BotMessageSquare, Flame, SaveAll, UsersRound, ScrollText,
  Settings, CreditCard,
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  active: { label: "Ativa", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  maintenance: { label: "Em Manutenção", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/20" },
  disabled: { label: "Desativada", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/20" },
};

const DEFAULT_MESSAGE = "Esta funcionalidade está temporariamente indisponível enquanto realizamos ajustes e melhorias para garantir uma experiência mais estável e segura.\n\nEm breve ela estará disponível novamente.";

export default function AdminFeatureControls() {
  const { features, isLoading, updateFeature } = useFeatureControls();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingFeature, setEditingFeature] = useState<FeatureControl | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFeature, setPreviewFeature] = useState<{ name: string; message: string | null }>({ name: "", message: null });

  const filtered = useMemo(() => {
    return features.filter(f => {
      if (search && !f.feature_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      return true;
    });
  }, [features, search, statusFilter]);

  const activeCount = features.filter(f => f.status === "active").length;
  const maintenanceCount = features.filter(f => f.status === "maintenance").length;
  const disabledCount = features.filter(f => f.status === "disabled").length;

  const openEdit = (feature: FeatureControl) => {
    setEditingFeature(feature);
    setEditMessage(feature.maintenance_message || "");
    setEditStatus(feature.status);
  };

  const handleSave = async () => {
    if (!editingFeature) return;
    try {
      await updateFeature.mutateAsync({
        id: editingFeature.id,
        status: editStatus,
        maintenance_message: editMessage || null,
      });
      toast.success(`"${editingFeature.feature_name}" atualizada`);
      setEditingFeature(null);
    } catch {
      toast.error("Erro ao salvar");
    }
  };

  const quickToggle = async (feature: FeatureControl) => {
    const newStatus = feature.status === "active" ? "maintenance" : "active";
    try {
      await updateFeature.mutateAsync({ id: feature.id, status: newStatus });
      toast.success(`"${feature.feature_name}" → ${STATUS_CONFIG[newStatus].label}`);
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Controle de Funcionalidades</h2>
        <p className="text-sm text-muted-foreground mt-1">Gerencie a disponibilidade de cada área do sistema para todos os usuários.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Ativas</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{maintenanceCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Manutenção</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{disabledCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Desativadas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionalidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {[
            { key: "all", label: "Todas" },
            { key: "active", label: "Ativas" },
            { key: "maintenance", label: "Manutenção" },
            { key: "disabled", label: "Desativadas" },
          ].map(f => (
            <Button
              key={f.key}
              size="sm"
              variant={statusFilter === f.key ? "default" : "outline"}
              onClick={() => setStatusFilter(f.key)}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Feature List */}
      <div className="space-y-2">
        {filtered.map(feature => {
          const Icon = ICON_MAP[feature.feature_icon] || Settings;
          const st = STATUS_CONFIG[feature.status] || STATUS_CONFIG.active;
          return (
            <div
              key={feature.id}
              className={`flex items-center gap-4 rounded-xl border p-4 transition-all duration-150 ${st.borderColor} ${st.bgColor}`}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${st.bgColor} border ${st.borderColor}`}>
                <Icon size={20} className={st.color} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{feature.feature_name}</h3>
                  <Badge variant="outline" className={`text-[9px] ${st.color} ${st.borderColor}`}>
                    {feature.status === "maintenance" && <Wrench size={9} className="mr-0.5" />}
                    {feature.status === "disabled" && <Lock size={9} className="mr-0.5" />}
                    {st.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{feature.feature_description}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Visualizar bloqueio"
                  onClick={() => {
                    setPreviewFeature({
                      name: feature.feature_name,
                      message: feature.maintenance_message,
                    });
                    setPreviewOpen(true);
                  }}
                >
                  <Eye size={15} className="text-muted-foreground" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Editar"
                  onClick={() => openEdit(feature)}
                >
                  <Pencil size={15} className="text-muted-foreground" />
                </Button>
                <button
                  onClick={() => quickToggle(feature)}
                  className="shrink-0"
                  title={feature.status === "active" ? "Colocar em manutenção" : "Ativar"}
                >
                  {feature.status === "active" ? (
                    <ToggleRight size={28} className="text-emerald-400" />
                  ) : (
                    <ToggleLeft size={28} className="text-muted-foreground/50" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingFeature && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditingFeature(null)} />
            <motion.div
              className="relative w-full max-w-lg rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="h-1 bg-gradient-to-r from-primary/60 via-amber-500/60 to-primary/60" />
              
              <button
                onClick={() => setEditingFeature(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted/50 text-muted-foreground z-10"
              >
                <X size={16} />
              </button>

              <div className="p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{editingFeature.feature_name}</h3>
                  <p className="text-xs text-muted-foreground">{editingFeature.feature_description}</p>
                </div>

                {/* Status selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Status</label>
                  <div className="flex gap-2">
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <Button
                        key={key}
                        size="sm"
                        variant={editStatus === key ? "default" : "outline"}
                        onClick={() => setEditStatus(key)}
                        className={`text-xs ${editStatus === key ? "" : cfg.color}`}
                      >
                        {cfg.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Custom message */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Mensagem de indisponibilidade</label>
                    <button
                      onClick={() => setEditMessage(DEFAULT_MESSAGE)}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    >
                      <RotateCcw size={10} /> Restaurar padrão
                    </button>
                  </div>
                  <Textarea
                    value={editMessage}
                    onChange={e => setEditMessage(e.target.value)}
                    placeholder="Mensagem exibida ao usuário quando a funcionalidade estiver indisponível..."
                    rows={4}
                    className="text-sm"
                  />
                </div>

                {/* Preview */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setPreviewFeature({
                      name: editingFeature.feature_name,
                      message: editMessage || null,
                    });
                    setEditingFeature(null);
                    setPreviewOpen(true);
                  }}
                >
                  <Eye size={14} className="mr-2" /> Visualizar como o usuário verá
                </Button>

                {/* Save */}
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setEditingFeature(null)}>
                    Cancelar
                  </Button>
                  <Button className="flex-1" onClick={handleSave} disabled={updateFeature.isPending}>
                    {updateFeature.isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                    Salvar
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <MaintenanceModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        featureName={previewFeature.name}
        message={previewFeature.message}
      />
    </div>
  );
}
