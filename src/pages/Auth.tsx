import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Lock, User, ShieldCheck, Phone, Eye, EyeOff, Building2, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, RefreshCw } from "lucide-react";
import logo from "@/assets/logo-new.png";

const translateAuthError = (msg: string): string => {
  const map: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
    "User already registered": "Este e-mail já está cadastrado.",
    "Signup requires a valid password": "Informe uma senha válida.",
    "Password should be at least 6 characters": "A senha deve ter no mínimo 6 caracteres.",
    "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "For security purposes, you can only request this after 60 seconds.": "Por segurança, aguarde 60 segundos antes de tentar novamente.",
    "User not found": "Usuário não encontrado.",
    "New password should be different from the old password.": "A nova senha deve ser diferente da anterior.",
  };
  return map[msg] || msg;
};

const isTimeoutError = (msg: string) =>
  msg?.includes("timeout") ||
  msg?.includes("upstream") ||
  msg?.includes("504") ||
  msg?.includes("503") ||
  msg?.includes("connection termination") ||
  msg?.includes("Failed to fetch") ||
  msg?.includes("NetworkError") ||
  msg?.includes("fetch") ||
  msg?.includes("Database error");

const Auth = () => {
  const { backendDown, retryConnection } = useAuth();
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showResendConfirm, setShowResendConfirm] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      toast({ title: "Informe seu e-mail", description: "Digite o e-mail cadastrado.", variant: "destructive" });
      return;
    }
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: window.location.origin } });
      if (error) throw error;
      toast({ title: "E-mail reenviado!", description: "Verifique sua caixa de entrada (e spam) para confirmar o cadastro." });
      setShowResendConfirm(false);
    } catch (error: any) {
      toast({ title: "Erro", description: translateAuthError(error.message), variant: "destructive" });
    } finally {
      setResendLoading(false);
    }
  };

  useEffect(() => {
    setIsLogin(searchParams.get("mode") !== "signup");
  }, [searchParams]);

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        navigate(redirectTo, { replace: true });
      }
    };
    checkExistingSession();
  }, [navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({ title: "Senha muito curta", description: "A senha deve ter no mínimo 8 caracteres.", variant: "destructive" });
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      toast({ title: "Senhas não coincidem", description: "A senha e a confirmação devem ser iguais.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        localStorage.setItem("dg_remember_me", rememberMe ? "true" : "false");
        if (!rememberMe) {
          sessionStorage.setItem("dg_session_alive", "true");
        } else {
          sessionStorage.removeItem("dg_session_alive");
        }
        navigate(`/welcome?to=${encodeURIComponent(redirectTo)}`);
      } else {
        const trimmedPhone = phone.trim().replace(/\D/g, "");
        if (trimmedPhone) {
          const { data: phoneAvailable } = await supabase.rpc("check_phone_available", { _phone: trimmedPhone });
          if (phoneAvailable === false) {
            toast({ title: "Telefone já cadastrado", description: "Este número de telefone já está vinculado a outra conta.", variant: "destructive" });
            setLoading(false);
            return;
          }
        }

        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim(), phone: trimmedPhone, company: company.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({ title: "Conta criada!", description: "Verifique seu email para confirmar o cadastro." });
      }
    } catch (error: any) {
      const rawMsg = error.message || "";
      if (isTimeoutError(rawMsg)) {
        toast({
          title: "Servidor indisponível",
          description: "O servidor está temporariamente fora do ar. Tente novamente em alguns minutos.",
          variant: "destructive",
        });
      } else if (rawMsg.includes("Email not confirmed")) {
        setShowResendConfirm(true);
        toast({ title: "Erro", description: translateAuthError(rawMsg), variant: "destructive" });
      } else {
        toast({ title: "Erro", description: translateAuthError(rawMsg), variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "pl-11 h-[52px] rounded-2xl border-[#1a2235]/80 bg-[#0d1117]/80 text-white text-sm font-medium placeholder:text-[#4b5563] focus:border-emerald-500/60 focus:bg-[#111827] focus:ring-1 focus:ring-emerald-500/30 transition-all duration-300 backdrop-blur-sm [&~.input-icon]:text-white/50 [&:focus~.input-icon]:text-emerald-400";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, #0a2e1a 0%, #0a0f0d 50%, #080b0a 100%)",
      }}
    >
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #22c55e, transparent 70%)" }} />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full opacity-[0.04]" style={{ background: "radial-gradient(circle, #22c55e, transparent 70%)" }} />
        <div className="absolute top-1/3 right-0 w-[200px] h-[200px] rounded-full opacity-[0.03]" style={{ background: "radial-gradient(circle, #fbbf24, transparent 70%)" }} />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Back button */}
      <div className="absolute top-6 left-6 z-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm font-medium text-white/40 hover:text-white/80 transition-colors duration-300 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-300" />
          Voltar
        </button>
      </div>

      <div className="w-full max-w-[440px] flex flex-col items-center relative z-10">
        {/* Logo + brand */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="flex flex-col items-center mb-10"
        >
          <div className="relative mb-4">
            <div className="absolute -inset-2 rounded-3xl opacity-30 blur-xl" style={{ background: "linear-gradient(135deg, #22c55e, #fbbf24)" }} />
            <img src={logo} alt="DG Contingência Pro" className="relative w-[88px] h-[88px] rounded-2xl shadow-2xl" style={{ background: '#111' }} />
          </div>
          <span className="text-[11px] font-bold tracking-[0.3em] uppercase">
            <span className="text-emerald-400">DG</span>
            <span className="text-white/60 mx-1">CONTINGÊNCIA</span>
            <span className="text-amber-400">PRO</span>
          </span>
        </motion.div>

        {/* Glass card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="w-full rounded-3xl p-8 sm:p-10 border border-white/[0.06] relative overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(17,24,39,0.7) 0%, rgba(10,15,13,0.8) 100%)",
            backdropFilter: "blur(40px)",
            boxShadow: "0 0 80px -20px rgba(34,197,94,0.08), 0 25px 50px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* Inner highlight line */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

          {/* Heading */}
          <div className="text-center mb-9">
            {backendDown && (
              <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div className="text-left">
                  <p className="font-semibold">Servidor temporariamente indisponível</p>
                  <p className="text-amber-300/70 mt-0.5">O sistema detectou instabilidade. Tentativas automáticas foram pausadas.</p>
                </div>
                <button
                  type="button"
                  onClick={retryConnection}
                  className="ml-auto shrink-0 p-1.5 rounded-lg hover:bg-amber-500/20 transition-colors"
                  title="Tentar reconectar"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            )}
            <h1 className="text-[28px] sm:text-[32px] font-extrabold text-white mb-2 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {isLogin ? "Bem-vindo" : "Crie sua conta"}
            </h1>
            <p className="text-[13px] text-white/40 font-medium">
              {isLogin ? "Entre para gerenciar seus disparos" : "Comece a enviar mensagens profissionais"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-[11px] font-semibold text-white/40 tracking-wider uppercase">
                    Nome completo
                  </Label>
                  <div className="relative group">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within:text-emerald-400 transition-colors" />
                    <Input id="fullName" type="text" placeholder="Seu nome" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} required maxLength={100} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-[11px] font-semibold text-white/40 tracking-wider uppercase">
                    Número de telefone
                  </Label>
                  <div className="relative group">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within:text-emerald-400 transition-colors" />
                    <Input id="phone" type="tel" placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required maxLength={20} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company" className="text-[11px] font-semibold text-white/40 tracking-wider uppercase">
                    Nome fantasia
                  </Label>
                  <div className="relative group">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within:text-emerald-400 transition-colors" />
                    <Input id="company" type="text" placeholder="Nome da empresa" value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} required maxLength={100} />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[11px] font-semibold text-white/40 tracking-wider uppercase">
                Endereço de e-mail
              </Label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within:text-emerald-400 transition-colors" />
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required maxLength={255} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[11px] font-semibold text-white/40 tracking-wider uppercase">
                Senha de acesso
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within:text-emerald-400 transition-colors" />
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="Mínimo 8 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} pr-11`} required minLength={8} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isLogin && (
                <div className="flex items-center justify-between mt-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="w-4 h-4 rounded-md border border-white/15 bg-white/5 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                        {rememberMe && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-white/35 group-hover:text-white/50 transition-colors">Manter conectado</span>
                  </label>
                </div>
              )}
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-[11px] font-semibold text-white/40 tracking-wider uppercase">
                  Confirmar senha
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 group-focus-within:text-emerald-400 transition-colors" />
                  <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Repita a senha" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`${inputClass} pr-11`} required minLength={8} />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/70 transition-colors">
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-[52px] text-[15px] font-bold rounded-2xl text-white transition-all duration-300 border-0 tracking-wide mt-3 relative overflow-hidden group"
              style={{
                background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                boxShadow: "0 8px 32px -8px rgba(34, 197, 94, 0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <span className="relative flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 opacity-70" />
                  {isLogin ? "Entrar" : "Criar conta"}
                </span>
              )}
            </Button>

            {/* Resend confirmation email */}
            {showResendConfirm && isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-center space-y-2 backdrop-blur-sm"
              >
                <p className="text-sm text-amber-200/80 font-medium">
                  Seu e-mail ainda não foi confirmado.
                </p>
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-300"
                  style={{ boxShadow: "0 4px 16px -4px rgba(34,197,94,0.3)" }}
                >
                  {resendLoading ? "Reenviando..." : "📧 Reenviar e-mail de confirmação"}
                </button>
              </motion.div>
            )}
          </form>

          {/* Security microcopy */}
          <div className="flex items-center justify-center gap-2 mt-6 text-[10px] text-white/25 font-medium tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Ambiente seguro e criptografado</span>
          </div>

          {/* Divider */}
          <div className="my-7 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

          <p className="text-center text-sm font-medium text-white/35">
            {isLogin ? "Não tem conta? " : "Já tem conta? "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors duration-300"
            >
              {isLogin ? "Criar agora" : "Faça login"}
            </button>
          </p>
        </motion.div>
      </div>

      {/* WhatsApp support button */}
      <a
        href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #22c55e, #16a34a)",
          boxShadow: "0 8px 24px -6px rgba(34,197,94,0.4)",
        }}
      >
        <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>
    </motion.div>
  );
};

export default Auth;
