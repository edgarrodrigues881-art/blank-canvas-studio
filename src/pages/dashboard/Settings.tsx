import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { User, Shield, Crown, Building2, Phone, Mail, Lock, Eye, EyeOff, Smartphone, Pencil, Check, X, Camera, CalendarClock, Sun, Moon, Monitor, Sparkles, ArrowRight, Palette } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState({ name: "", company: "", phone: "", avatar_url: "" });
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [deviceCount, setDeviceCount] = useState(0);
  const [planInfo, setPlanInfo] = useState<{ plan_name: string; plan_price: number; max_instances: number; expires_at: string } | null>(null);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("profiles")
      .select("full_name, company, phone, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile({
            name: data.full_name || "",
            company: data.company || "",
            phone: data.phone || "",
            avatar_url: data.avatar_url || "",
          });
        }
      });

    supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .neq("login_type", "report_wa")
      .then(({ count }) => {
        setDeviceCount(count || 0);
      });

    supabase
      .from("subscriptions")
      .select("plan_name, plan_price, max_instances, expires_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setPlanInfo(data);
        }
      });
  }, [user]);

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const saveField = async (field: string) => {
    if (!user) return;
    setSaving(true);

    const trimmed = editValue.trim();
    const updatedProfile = { ...profile, [field]: trimmed };

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: updatedProfile.name,
        company: updatedProfile.company,
        phone: updatedProfile.phone,
        client_type: "user",
        updated_at: new Date().toISOString(),
      });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setProfile(updatedProfile);
      toast({ title: "Salvo", description: "Informação atualizada com sucesso." });
    }
    setEditingField(null);
    setEditValue("");
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 2MB.", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: "Erro no upload", description: uploadError.message, variant: "destructive" });
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    await supabase.from("profiles").update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq("id", user.id);

    setProfile((p) => ({ ...p, avatar_url: avatarUrl }));
    toast({ title: "Foto atualizada" });
    setUploadingAvatar(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Senha muito curta", description: "Mínimo 8 caracteres.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", description: "A nova senha e a confirmação devem ser iguais.", variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha atualizada", description: "Sua senha foi alterada com sucesso." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  };

  const inputClass = "h-10 rounded-lg border-border/60 bg-background focus:border-primary focus:ring-0 text-sm";

  const daysRemaining = planInfo?.expires_at
    ? Math.max(0, Math.ceil((new Date(planInfo.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const initials = (profile.name || user?.email?.split("@")[0] || "U").slice(0, 2).toUpperCase();

  const renderEditableField = (
    field: string,
    label: string,
    icon: React.ReactNode,
    placeholder: string,
    maxLength: number
  ) => {
    const isEditing = editingField === field;
    const value = profile[field as keyof typeof profile];

    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </Label>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder={placeholder}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className={inputClass}
              maxLength={maxLength}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveField(field);
                if (e.key === "Escape") cancelEdit();
              }}
            />
            <Button size="icon" variant="ghost" onClick={() => saveField(field)} disabled={saving} className="h-9 w-9 text-primary hover:text-primary/80 shrink-0">
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <div className={`flex-1 h-10 flex items-center px-3 rounded-lg border border-transparent text-sm ${value ? "text-foreground/60" : "text-muted-foreground/40"}`}>
              {value || placeholder}
            </div>
            <Button size="icon" variant="ghost" onClick={() => startEdit(field, value)} className="h-9 w-9 text-muted-foreground/40 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const WA_GREEN = "#25D366";
  const WA_GREEN_DARK = "#07C160";

  const usagePercent = planInfo?.max_instances
    ? Math.min(100, Math.round((deviceCount / planInfo.max_instances) * 100))
    : 0;
  const usageColor =
    usagePercent >= 90 ? "#EF4444" : usagePercent >= 70 ? "#F59E0B" : WA_GREEN;

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* ════════════ HEADER ════════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/30 p-6 sm:p-8">
        <div
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl pointer-events-none opacity-60"
          style={{ background: "radial-gradient(circle, rgba(37,211,102,0.15) 0%, transparent 70%)" }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em] mb-3 border border-primary/20 bg-primary/5 text-primary">
              <Sparkles className="w-3 h-3" />
              Sua conta
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Configurações</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie seu perfil, aparência e segurança em um só lugar.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-primary/30 shadow-lg" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center border-2 border-primary/30 shadow-lg">
                  <span className="text-lg font-bold text-primary">{initials}</span>
                </div>
              )}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-foreground leading-tight">{profile.name || "Sem nome"}</p>
              <p className="text-[11px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════ PLAN HERO CARD ════════════ */}
      <div
        className="relative overflow-hidden rounded-2xl border p-6 sm:p-7"
        style={{
          background:
            "linear-gradient(135deg, rgba(37,211,102,0.08) 0%, hsl(var(--card)) 60%, rgba(234,179,8,0.06) 100%)",
          borderColor: "rgba(37,211,102,0.25)",
          boxShadow: "0 20px 60px -25px rgba(37,211,102,0.35)",
        }}
      >
        <div
          className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(234,179,8,0.10) 0%, transparent 70%)" }}
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6 items-center">
          {/* Icon + título do plano */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: `linear-gradient(135deg, ${WA_GREEN} 0%, ${WA_GREEN_DARK} 100%)`,
                boxShadow: "0 8px 20px -6px rgba(7,193,96,0.5)",
              }}
            >
              <Crown className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1">
                Plano atual
              </p>
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">
                  {planInfo?.plan_name || "Sem plano"}
                </h2>
                {planInfo && (
                  <span className="text-sm font-semibold text-foreground/60">
                    R$ {Number(planInfo.plan_price).toFixed(2).replace(".", ",")}
                  </span>
                )}
              </div>
              {daysRemaining !== null && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                  <CalendarClock className="w-3 h-3" />
                  Renovação em {daysRemaining} {daysRemaining === 1 ? "dia" : "dias"}
                </p>
              )}
            </div>
          </div>

          {/* Barra de uso de instâncias */}
          <div className="lg:px-6 lg:border-l lg:border-r border-border/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                Uso de instâncias
              </span>
              <span className="text-sm font-bold text-foreground">
                {deviceCount}<span className="text-foreground/40 font-medium"> / {planInfo?.max_instances ?? "—"}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${usagePercent}%`, background: usageColor, boxShadow: `0 0 12px ${usageColor}80` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {usagePercent}% do limite utilizado
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={() => navigate("/dashboard/my-plan")}
            className="h-11 px-5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-[0.98] hover:brightness-110 whitespace-nowrap"
            style={{
              background: `linear-gradient(135deg, ${WA_GREEN} 0%, ${WA_GREEN_DARK} 100%)`,
              color: "#ffffff",
              boxShadow: "0 8px 20px -6px rgba(7,193,96,0.5)",
            }}
          >
            Ver planos
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* ════════════ MAIN GRID — Pessoais (esquerda) | Aparência + Segurança (direita) ════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Personal Info */}
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative group">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-border/50" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center border-2 border-border/50">
                    <span className="text-lg font-semibold text-primary">{initials}</span>
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{profile.name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground">{uploadingAvatar ? "Enviando..." : "Clique na foto para alterar"}</p>
              </div>
            </div>

            <Separator className="bg-border/30" />

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3 h-3" />
                Email
              </Label>
              <div className="h-10 flex items-center px-3 rounded-lg bg-muted/30 text-muted-foreground text-sm cursor-not-allowed">
                {user?.email || ""}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {renderEditableField("name", "Nome Completo", <User className="w-3 h-3" />, "Seu nome", 100)}
              {renderEditableField("company", "Empresa", <Building2 className="w-3 h-3" />, "Nome da empresa", 100)}
            </div>

            {renderEditableField("phone", "Telefone", <Phone className="w-3 h-3" />, "+55 11 99999-9999", 20)}
          </CardContent>
        </Card>

        {/* Coluna direita: Aparência + Segurança empilhados */}
        <div className="space-y-5">
          {/* Appearance */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Palette className="w-4 h-4 text-primary" />
                </div>
                Aparência
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "light", label: "Claro", icon: Sun, desc: "Tema claro" },
                  { value: "dark", label: "Escuro", icon: Moon, desc: "Tema escuro" },
                  { value: "system", label: "Sistema", icon: Monitor, desc: "Automático" },
                ] as const).map(({ value, label, icon: Icon }) => {
                  const isActive = theme === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={`group relative flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-xl border transition-all duration-150 ${
                        isActive
                          ? "border-primary/50 bg-primary/5 shadow-[0_0_20px_-8px_hsl(var(--primary))]"
                          : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}
                        strokeWidth={isActive ? 2.2 : 1.6}
                      />
                      <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                      {isActive && (
                        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                Segurança da Conta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  Senha Atual
                </Label>
                <div className="relative">
                  <Input type={showCurrent ? "text" : "password"} placeholder="Sua senha atual" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={`${inputClass} pr-10`} />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Separator className="bg-border/30" />

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nova Senha</Label>
                  <div className="relative">
                    <Input type={showNew ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${inputClass} pr-10`} minLength={8} />
                    <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Input type={showConfirm ? "text" : "password"} placeholder="Repita a nova senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`${inputClass} pr-10`} minLength={8} />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={changingPassword || !newPassword || !confirmPassword}
                className="w-full h-10"
                style={{
                  background: `linear-gradient(135deg, ${WA_GREEN} 0%, ${WA_GREEN_DARK} 100%)`,
                  color: "#ffffff",
                  border: 0,
                }}
              >
                {changingPassword ? "Atualizando..." : "Atualizar Senha"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
