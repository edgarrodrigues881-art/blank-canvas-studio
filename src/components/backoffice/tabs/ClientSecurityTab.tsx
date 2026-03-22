import { Button } from "@/components/ui/button";
import { useAdminAction, type AdminUser } from "@/hooks/useAdmin";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, LogOut, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  client: AdminUser;
}

const ClientSecurityTab = ({ client }: Props) => {
  const { mutate, isPending } = useAdminAction();
  const { toast } = useToast();

  const resetPassword = () => {
    mutate(
      { action: "reset-password", body: { target_user_id: client.id, email: client.email } },
      {
        onSuccess: () => toast({ title: "Link de redefinição gerado com sucesso" }),
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const forceLogout = () => {
    mutate(
      { action: "force-logout", body: { target_user_id: client.id } },
      {
        onSuccess: () => toast({ title: "Usuário deslogado de todas as sessões" }),
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  const toggleStatus = (newStatus: string) => {
    mutate(
      { action: "toggle-status", body: { target_user_id: client.id, new_status: newStatus } },
      {
        onSuccess: () => toast({ title: `Status alterado para ${newStatus === "active" ? "Ativo" : newStatus === "suspended" ? "Suspenso" : "Cancelado"}` }),
        onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6 space-y-6">
      <h3 className="text-lg font-semibold text-zinc-200">Segurança & Acesso</h3>

      <div className="space-y-4">
        {/* Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 rounded-lg p-4">
            <p className="text-xs text-zinc-400">E-mail de login</p>
            <p className="text-zinc-200 mt-1">{client.email}</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-4">
            <p className="text-xs text-zinc-400">Último login</p>
            <p className="text-zinc-200 mt-1">{client.last_sign_in_at ? new Date(client.last_sign_in_at).toLocaleString("pt-BR") : "Nunca"}</p>
          </div>
          <div className="bg-zinc-900 rounded-lg p-4">
            <p className="text-xs text-zinc-400">Roles</p>
            <div className="flex gap-1.5 mt-1">
              {client.roles.length > 0 ? client.roles.map(r => (
                <Badge key={r} className="bg-purple-600/50 text-purple-200 text-xs">{r}</Badge>
              )) : <span className="text-zinc-500 text-sm">user</span>}
            </div>
          </div>
          <div className="bg-zinc-900 rounded-lg p-4">
            <p className="text-xs text-zinc-400">Status da conta</p>
            <Badge className={`mt-1 ${client.status === "active" ? "bg-green-600" : client.status === "suspended" ? "bg-yellow-600" : "bg-red-600"} text-white`}>
              {client.status === "active" ? "Ativo" : client.status === "suspended" ? "Suspenso" : "Cancelado"}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-zinc-700 pt-4 space-y-3">
          <h4 className="text-sm font-medium text-zinc-300">Ações de Segurança</h4>
          
          <div className="flex flex-wrap gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-zinc-600 text-zinc-300 hover:text-white" disabled={isPending}>
                  <KeyRound size={16} className="mr-2" /> Resetar Senha
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <AlertDialogHeader>
                  <AlertDialogTitle>Resetar senha?</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    Um link de redefinição será gerado para {client.email}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-zinc-600 text-zinc-300">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={resetPassword} className="bg-purple-600 hover:bg-purple-700">Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="border-zinc-600 text-zinc-300 hover:text-white" disabled={isPending}>
                  <LogOut size={16} className="mr-2" /> Forçar Logout
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <AlertDialogHeader>
                  <AlertDialogTitle>Forçar logout?</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    Todas as sessões ativas de {client.full_name || client.email} serão encerradas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-zinc-600 text-zinc-300">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={forceLogout} className="bg-red-600 hover:bg-red-700">Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {client.status === "active" ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="border-yellow-600/50 text-yellow-400 hover:text-yellow-300" disabled={isPending}>
                    <ShieldAlert size={16} className="mr-2" /> Suspender Conta
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Suspender conta?</AlertDialogTitle>
                    <AlertDialogDescription className="text-zinc-400">
                      O usuário será impedido de acessar o sistema.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-zinc-600 text-zinc-300">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => toggleStatus("suspended")} className="bg-yellow-600 hover:bg-yellow-700">Suspender</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button variant="outline" className="border-green-600/50 text-green-400 hover:text-green-300" onClick={() => toggleStatus("active")} disabled={isPending}>
                <ShieldCheck size={16} className="mr-2" /> Reativar Conta
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientSecurityTab;
