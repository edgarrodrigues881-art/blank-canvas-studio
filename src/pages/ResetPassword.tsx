import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo-new.png";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check hash for type=recovery
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({
        title: "Senha muito curta",
        description: "A senha deve ter no mínimo 8 caracteres.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Senhas não coincidem",
        description: "A senha e a confirmação devem ser iguais.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({
        title: "Senha atualizada!",
        description: "Sua senha foi redefinida com sucesso.",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "pl-11 h-12 rounded-xl border-[#1E2330] bg-[#151821] text-[#E5E7EB] placeholder:text-[#9CA3AF]/40 focus:border-[#22C55E] focus:ring-0 transition-colors duration-150";

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0F1115' }}>
        <div className="w-full max-w-[420px] text-center">
          <img src={logo} alt="DG Contingência" className="w-10 h-10 rounded-xl mb-3 mx-auto" />
          <h1 className="text-2xl font-bold text-[#E5E7EB] mb-2">Link inválido</h1>
          <p className="text-sm text-[#9CA3AF] mb-6">
            Este link de recuperação expirou ou é inválido. Solicite um novo.
          </p>
          <Button
            onClick={() => navigate("/auth")}
            className="bg-[#22C55E] hover:bg-[#16A34A] text-white border-0"
          >
            Voltar ao login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative" style={{ backgroundColor: '#0F1115' }}>
      <button
        onClick={() => navigate("/auth")}
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-[#9CA3AF] hover:text-[#22C55E] transition-colors duration-150"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </button>

      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="DG Contingência" className="w-10 h-10 rounded-xl mb-3" />
          <span className="text-xs font-medium tracking-wide text-[#9CA3AF]">DG Contingência</span>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#E5E7EB] mb-1.5">Redefinir senha</h1>
          <p className="text-sm text-[#9CA3AF]">Digite sua nova senha abaixo</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-[#9CA3AF]">Nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]/50" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Mínimo 8 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]/50 hover:text-[#9CA3AF] transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-xs font-medium text-[#9CA3AF]">Confirmar nova senha</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]/50" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repita a senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]/50 hover:text-[#9CA3AF] transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-sm font-semibold rounded-xl bg-[#22C55E] hover:bg-[#16A34A] text-white shadow-sm transition-colors duration-150 border-0"
            style={{ boxShadow: '0 2px 8px rgba(34, 197, 94, 0.15)' }}
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Salvar nova senha"
            )}
          </Button>
        </form>

        <div className="flex items-center justify-center gap-1.5 mt-4 text-[11px] text-[#9CA3AF]/60">
          <ShieldCheck className="w-3 h-3" />
          <span>Ambiente seguro e criptografado</span>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
