import { useState, useEffect } from "react";
import { Lock, LogOut, Loader2, Eye, EyeOff } from "lucide-react";
import logoNew from "@/assets/logo-new.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import BackOfficeDashboard from "@/components/backoffice/BackOfficeDashboard";

const BackOffice = ({ initialTab }: { initialTab?: string }) => {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const { toast } = useToast();

  // Force light theme locally via class on the wrapper
  useEffect(() => {
    document.documentElement.classList.add("backoffice-light");
    return () => document.documentElement.classList.remove("backoffice-light");
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkAdminRole = async (userId: string) => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        if (isMounted) setIsAdmin(!!data);
      } catch {
        if (isMounted) setIsAdmin(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        if (newSession?.user) {
          setTimeout(() => checkAdminRole(newSession.user.id), 0);
        } else {
          setIsAdmin(false);
        }
      }
    );

    const initializeAuth = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(s);
        if (s?.user) await checkAdminRole(s.user.id);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();
    return () => { isMounted = false; subscription.unsubscribe(); };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogging(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) {
        const isTimeout = error.message?.includes("timeout") || error.message?.includes("fetch") || error.status === 504 || error.status === 500;
        toast({
          title: isTimeout ? "Servidor temporariamente indisponível" : "Credenciais inválidas",
          description: isTimeout ? "O banco de dados está sobrecarregado. Aguarde alguns minutos e tente novamente." : error.message,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor. Tente novamente em alguns minutos.",
        variant: "destructive",
      });
    }
    setLogging(false);
  };


  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        {/* Golden ambient glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
        {/* Floating particles */}
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-primary/30 pointer-events-none"
            style={{
              left: `${10 + i * 10}%`,
              top: `${20 + (i % 4) * 18}%`,
              animation: `bo-particle-float ${3 + i * 0.6}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
        <div className="w-full max-w-[400px] relative z-10">
          <div className="text-center mb-8">
            {/* Logo with golden ring */}
            <div className="relative inline-block mb-4">
              <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl scale-150" />
              <div className="relative z-10 p-[3px] rounded-2xl bg-gradient-to-br from-primary via-primary/60 to-primary">
                <img src={logoNew} alt="DG Logo" className="w-20 h-20 rounded-[13px] block" />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-primary">DG</span>{" "}
              <span className="text-foreground">CONTINGÊNCIA</span>{" "}
              <span className="text-primary">PRO</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Acesso restrito a administradores</p>
          </div>

            <form onSubmit={handleLogin} className="bg-card rounded-2xl border border-border p-8 shadow-sm space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">E-mail</label>
                <Input placeholder="admin@empresa.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-background border-border text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Senha</label>
                <div className="relative">
                  <Input type={showPass ? "text" : "password"} placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)}
                    className="h-11 bg-background border-border text-foreground placeholder:text-muted-foreground/50 pr-10 focus:border-primary focus:ring-primary/20" />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <Button type="submit" disabled={logging} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl">
                {logging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Entrar
              </Button>
            </form>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">⛔ Acesso restrito</p>
          <p className="text-sm text-muted-foreground mt-1">Apenas administradores podem acessar esta área.</p>
        </div>
        <Button variant="outline" onClick={handleLogout} className="border-border text-muted-foreground hover:bg-accent">
          <LogOut size={16} className="mr-1" /> Sair
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <BackOfficeDashboard onLogout={handleLogout} initialTab={initialTab} />
    </div>
  );
};

export default BackOffice;
