import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { User, Shield, Crown, Building2, Phone, Mail, Lock, Eye, EyeOff, Smartphone, Pencil, Check, X, Camera, DollarSign, CalendarClock, Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

const Settings = () => {
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e segurança</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Personal Info */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                <User className="w-4 h-4 text-primary" />
                Informações Pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar */}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {renderEditableField("name", "Nome Completo", <User className="w-3 h-3" />, "Seu nome", 100)}
                {renderEditableField("company", "Empresa", <Building2 className="w-3 h-3" />, "Nome da empresa", 100)}
              </div>

              {renderEditableField("phone", "Telefone", <Phone className="w-3 h-3" />, "+55 11 99999-9999", 20)}
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                <Sun className="w-4 h-4 text-primary" />
                Aparência
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/30">
                {([
                  { value: "light", label: "Claro", icon: Sun },
                  { value: "dark", label: "Escuro", icon: Moon },
                  { value: "system", label: "Sistema", icon: Monitor },
                ] as const).map(({ value, label, icon: Icon }) => {
                  const isActive = theme === value;
                  return (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-background text-foreground shadow-sm border border-border/40"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={isActive ? 2 : 1.5} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                <Shield className="w-4 h-4 text-primary" />
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <Button variant="outline" onClick={handleChangePassword} disabled={changingPassword || !newPassword || !confirmPassword} className="border-border/60">
                {changingPassword ? "Atualizando..." : "Atualizar Senha"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Plan Info */}
        <div>
          <Card className="border-border/50 sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                <Crown className="w-4 h-4 text-primary" />
                Plano Atual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Plano</span>
                  <span className="text-sm font-medium text-foreground">{planInfo?.plan_name || "Sem plano"}</span>
                </div>
                <Separator className="bg-border/30" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Valor
                  </span>
                  <span className="text-sm text-foreground">{planInfo ? `R$ ${Number(planInfo.plan_price).toFixed(2)}` : "—"}</span>
                </div>
                <Separator className="bg-border/30" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Instâncias</span>
                  <span className="text-sm text-foreground">{planInfo?.max_instances ?? "—"}</span>
                </div>
                <Separator className="bg-border/30" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    Em uso
                  </span>
                  <span className="text-sm text-foreground">{deviceCount}</span>
                </div>
                <Separator className="bg-border/30" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    Renovação
                  </span>
                  <span className="text-sm text-foreground">
                    {daysRemaining !== null ? `${daysRemaining} dias` : "—"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
