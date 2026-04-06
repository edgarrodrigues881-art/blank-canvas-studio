import { useState } from "react";
import { useTeam } from "@/hooks/useTeam";
import { useAuth } from "@/lib/auth";
import { useManagePermissions, PERMISSION_KEYS, type PermissionKey, type PermissionPreset } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, UserPlus, Mail, MoreVertical, Shield, Headphones, Trash2,
  Clock, Circle, Lock, CheckSquare, XSquare, Loader2, Save, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TeamManagement = () => {
  const { user } = useAuth();
  const {
    members, invites, loading, myTeamRole,
    inviteMember, updateMemberRole, removeMember, cancelInvite, isOnline,
  } = useTeam();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("atendente");
  const [sending, setSending] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const isAdmin = myTeamRole === "admin";

  const {
    permissions, permissionMode, setPermissionMode, presets,
    loading: permLoading, saving, togglePermission, selectAll, removeAll, applyPreset, save,
  } = useManagePermissions(selectedMemberId, user?.id || null);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    await inviteMember(inviteEmail, inviteRole);
    setInviteEmail("");
    setSending(false);
  };

  const openPermissions = (memberId: string) => {
    setSelectedMemberId(memberId);
    setPermDialogOpen(true);
  };

  const handleSavePermissions = async () => {
    await save();
    setPermDialogOpen(false);
  };

  // Group permissions by category
  const permGroups = Object.entries(PERMISSION_KEYS).reduce((acc, [key, val]) => {
    if (!acc[val.group]) acc[val.group] = [];
    acc[val.group].push({ key: key as PermissionKey, label: val.label });
    return acc;
  }, {} as Record<string, { key: PermissionKey; label: string }[]>);

  const selectedMember = members.find((m) => m.member_id === selectedMemberId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Equipe</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua equipe de atendimento</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{members.length}</p>
                <p className="text-xs text-muted-foreground">Membros ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Circle className="w-5 h-5 text-emerald-500 fill-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {members.filter((m) => isOnline(m.profile?.last_seen_at || null)).length}
                </p>
                <p className="text-xs text-muted-foreground">Online agora</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invites.length}</p>
                <p className="text-xs text-muted-foreground">Convites pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invite */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Convidar membro
            </CardTitle>
            <CardDescription>Envie um convite por e-mail ou adicione diretamente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="email@exemplo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={sending || !inviteEmail.trim()}>
                <Mail className="w-4 h-4 mr-1" /> Convidar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Convites pendentes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Expira em {format(new Date(inv.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{inv.role}</Badge>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" onClick={() => cancelInvite(inv.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros da equipe</CardTitle>
          <CardDescription>{members.length} {members.length === 1 ? "membro ativo" : "membros ativos"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Owner */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-card" />
              </div>
              <div>
                <p className="text-sm font-semibold">Você (Proprietário)</p>
                <p className="text-[11px] text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Badge className="bg-primary/15 text-primary border-primary/20">Admin</Badge>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum membro adicionado. Convide alguém para começar.
            </p>
          ) : (
            members.map((m) => {
              const online = isOnline(m.profile?.last_seen_at || null);
              return (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center",
                        m.role === "admin" ? "bg-primary/10" : "bg-blue-500/10"
                      )}>
                        {m.role === "admin" ? <Shield className="w-4 h-4 text-primary" /> : <Headphones className="w-4 h-4 text-blue-500" />}
                      </div>
                      {online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-card" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.profile?.full_name || m.invited_email || "Membro"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {online ? <span className="text-emerald-500">Online agora</span>
                          : m.profile?.last_seen_at ? `Visto: ${format(new Date(m.profile.last_seen_at), "dd/MM HH:mm")}` : "Nunca conectou"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", m.role === "admin" ? "border-primary/30 text-primary" : "border-blue-500/30 text-blue-500")}>
                      {m.role === "admin" ? "Admin" : "Atendente"}
                    </Badge>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="w-7 h-7">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openPermissions(m.member_id)} className="gap-2">
                            <Settings2 className="w-4 h-4" /> Permissões
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateMemberRole(m.id, m.role === "admin" ? "atendente" : "admin")}>
                            {m.role === "admin" ? "Mudar para Atendente" : "Promover a Admin"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => removeMember(m.id)}>
                            Remover da equipe
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Permissions Dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Permissões de Acesso
              {selectedMember && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {selectedMember.profile?.full_name || selectedMember.invited_email}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {permLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Presets */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">Perfis prontos</p>
                <div className="flex flex-wrap gap-2">
                  {presets.filter((p) => p.is_system).map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Mode toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                <div>
                  <p className="text-sm font-medium">Modo de bloqueio</p>
                  <p className="text-[10px] text-muted-foreground">Como mostrar itens sem permissão</p>
                </div>
                <Select value={permissionMode} onValueChange={(v) => setPermissionMode(v as "lock" | "hide")}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lock">🔒 Mostrar com cadeado</SelectItem>
                    <SelectItem value="hide">👁️ Ocultar completamente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={selectAll}>
                  <CheckSquare className="w-3.5 h-3.5" /> Selecionar tudo
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={removeAll}>
                  <XSquare className="w-3.5 h-3.5" /> Remover tudo
                </Button>
              </div>

              {/* Permission groups */}
              {Object.entries(permGroups).map(([group, items]) => (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</p>
                  <div className="space-y-1">
                    {items.map(({ key, label }) => (
                      <div
                        key={key}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-lg border transition-colors",
                          permissions[key]
                            ? "bg-primary/5 border-primary/20"
                            : "bg-muted/20 border-border/30 opacity-60"
                        )}
                      >
                        <span className="text-sm font-medium">{label}</span>
                        <Switch
                          checked={permissions[key]}
                          onCheckedChange={() => togglePermission(key)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePermissions} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamManagement;
