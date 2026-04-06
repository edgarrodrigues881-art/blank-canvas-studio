import { useState } from "react";
import { useTeam } from "@/hooks/useTeam";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  UserPlus,
  Mail,
  MoreVertical,
  Shield,
  Headphones,
  Trash2,
  Clock,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TeamManagement = () => {
  const { user } = useAuth();
  const {
    members,
    invites,
    loading,
    myTeamRole,
    inviteMember,
    updateMemberRole,
    removeMember,
    cancelInvite,
    isOnline,
  } = useTeam();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("atendente");
  const [sending, setSending] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    await inviteMember(inviteEmail, inviteRole);
    setInviteEmail("");
    setSending(false);
  };

  const isAdmin = myTeamRole === "admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie sua equipe de atendimento
        </p>
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

      {/* Invite / Add Member */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Convidar membro
            </CardTitle>
            <CardDescription>
              Envie um convite por e-mail ou adicione diretamente
            </CardDescription>
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
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleInvite} disabled={sending || !inviteEmail.trim()}>
                <Mail className="w-4 h-4 mr-1" />
                Convidar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Invites */}
      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convites pendentes</CardTitle>
          </CardHeader>
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
          <CardDescription>
            {members.length} {members.length === 1 ? "membro ativo" : "membros ativos"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Owner (self) */}
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
                        {m.role === "admin" ? (
                          <Shield className="w-4 h-4 text-primary" />
                        ) : (
                          <Headphones className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                      {online && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-card" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {m.profile?.full_name || m.invited_email || "Membro"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {online ? (
                          <span className="text-emerald-500">Online agora</span>
                        ) : m.profile?.last_seen_at ? (
                          `Visto por último: ${format(new Date(m.profile.last_seen_at), "dd/MM HH:mm")}`
                        ) : (
                          "Nunca conectou"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      m.role === "admin" ? "border-primary/30 text-primary" : "border-blue-500/30 text-blue-500"
                    )}>
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
    </div>
  );
};

export default TeamManagement;
