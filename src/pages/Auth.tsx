import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Lock, User, ShieldCheck, Phone, Eye, EyeOff, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, RefreshCw } from "lucide-react";
import logo from "@/assets/logo-new.png";

/* ── helpers (unchanged) ── */
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
  msg?.includes("timeout") || msg?.includes("upstream") || msg?.includes("504") ||
  msg?.includes("503") || msg?.includes("connection termination") ||
  msg?.includes("Failed to fetch") || msg?.includes("NetworkError") ||
  msg?.includes("fetch") || msg?.includes("Database error");

const isPhoneIdentifier = (value: string) => /\d/.test(value) && !value.includes("@");
const normalizePhone = (value: string) => value.replace(/\D/g, "");

/* ── Minimal floating particles ── */
const PARTICLES = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2;
  const r = 90 + Math.random() * 20;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r,
    size: 2.5 + Math.random() * 2,
    delay: i * 0.8,
    duration: 4 + Math.random() * 2,
  };
});

const FloatingParticles = () => (
  <div className="absolute inset-0 pointer-events-none">
    {PARTICLES.map((p, i) => (
      <motion.div
        key={i}
        className="absolute rounded-full"
        style={{
          width: p.size,
          height: p.size,
          left: "50%",
          top: "50%",
          marginLeft: p.x - p.size / 2,
          marginTop: p.y - p.size / 2,
          background: "rgba(34, 197, 94, 0.4)",
          boxShadow: "0 0 8px rgba(34, 197, 94, 0.25)",
        }}
        animate={{
          opacity: [0, 0.5, 0],
          y: [0, -6, 0],
        }}
        transition={{
          duration: p.duration,
          delay: p.delay,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    ))}
  </div>
);

/* ── Stagger wrapper ── */
const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.07 } } },
  item: { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } } },
};

/* ── Main component ── */
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
  const [resolvedLoginEmail, setResolvedLoginEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleResendConfirmation = async () => {
    const resendEmail = resolvedLoginEmail || email.trim();
    if (!resendEmail) {
      toast({ title: "Informe seu e-mail", description: "Digite o e-mail cadastrado.", variant: "destructive" });
      return;
    }
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: resendEmail, options: { emailRedirectTo: window.location.origin } });
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

  const resolveLoginEmail = async (identifier: string, rawPassword: string) => {
    const trimmedIdentifier = identifier.trim();
    const normalizedIdentifier = isPhoneIdentifier(trimmedIdentifier)
      ? normalizePhone(trimmedIdentifier)
      : trimmedIdentifier.toLowerCase();
    const { data, error } = await supabase.functions.invoke("legacy-login", {
      body: { identifier: normalizedIdentifier, password: rawPassword },
    });
    if (error) {
      if (!isPhoneIdentifier(trimmedIdentifier)) return trimmedIdentifier;
      throw new Error(data?.error || error.message || "Não foi possível localizar sua conta antiga.");
    }
    if (!data?.email) return trimmedIdentifier;
    return data.email as string;
  };

  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) navigate(redirectTo, { replace: true });
    };
    checkExistingSession();
  }, [navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && password.length < 8) {
      toast({ title: "Senha muito curta", description: "A senha deve ter no mínimo 8 caracteres.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        setResolvedLoginEmail(null);
        const loginEmail = await resolveLoginEmail(email, password);
        setResolvedLoginEmail(loginEmail);
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
        localStorage.setItem("dg_remember_me", rememberMe ? "true" : "false");
        if (!rememberMe) sessionStorage.setItem("dg_session_alive", "true");
        else sessionStorage.removeItem("dg_session_alive");
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
        toast({ title: "Servidor indisponível", description: "O servidor está temporariamente fora do ar. Tente novamente em alguns minutos.", variant: "destructive" });
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

  /* ── Render ── */
  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 py-10 relative overflow-hidden"
      style={{ background: "#090e0c" }}
    >
      {/* Ambient background – lightweight radial gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[700px] h-[500px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, #22c55e, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full opacity-[0.03]"
          style={{ background: "radial-gradient(circle, #fbbf24, transparent 70%)" }}
        />
      </div>

      {/* Subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Back */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 z-20 flex items-center gap-1.5 text-xs font-medium text-white/30 hover:text-white/60 transition-colors group"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Voltar
      </motion.button>

      <div className="w-full max-w-[420px] flex flex-col items-center relative z-10">
        {/* ── Logo + Particles ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center mb-8"
        >
          <div className="relative w-[240px] h-[240px] flex items-center justify-center mb-5">
            <FloatingParticles />
            {/* Soft radial glow */}
            <div
              className="absolute w-40 h-40 rounded-full opacity-15"
              style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)" }}
            />
            {/* Clean logo — no border box */}
            <img
              src={logo}
              alt="DG Contingência Pro"
              className="relative w-[140px] h-[140px] rounded-2xl drop-shadow-lg"
            />
          </div>
          <span className="text-xs font-semibold tracking-[0.4em] uppercase select-none">
            <span style={{ color: "#34d399" }}>DG</span>
            <span className="text-white/50 mx-2">CONTINGÊNCIA</span>
            <span style={{ color: "#fbbf24" }}>PRO</span>
          </span>
        </motion.div>

        {/* ── Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
          className="w-full rounded-2xl border relative overflow-hidden"
          style={{
            borderColor: "#1f2937",
            background: "linear-gradient(180deg, rgba(15,20,17,0.95) 0%, rgba(10,14,12,0.98) 100%)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3), 0 20px 40px -20px rgba(0,0,0,0.4)",
          }}
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(34,197,94,0.15) 30%, rgba(251,191,36,0.1) 70%, transparent)" }} />

          <div className="px-7 pt-7 pb-8 sm:px-9 sm:pt-8 sm:pb-9">
            {/* Backend down alert */}
            {backendDown && (
              <div className="mb-5 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div className="text-left flex-1">
                  <p className="font-semibold text-[11px]">Servidor temporariamente indisponível</p>
                  <p className="text-amber-300/60 text-[10px] mt-0.5">Tentativas automáticas pausadas.</p>
                </div>
                <button type="button" onClick={retryConnection} className="shrink-0 p-1 rounded-lg hover:bg-amber-500/10 transition-colors" title="Tentar reconectar">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Heading */}
            <div className="text-center mb-7">
              <h1 className="text-2xl sm:text-[28px] font-bold text-white tracking-tight leading-tight">
                {isLogin ? "Bem-vindo de volta" : "Crie sua conta"}
              </h1>
              <p className="text-[13px] text-white/40 mt-1.5 font-normal">
                {isLogin ? "Entre para gerenciar seus disparos" : "Comece a enviar mensagens profissionais"}
              </p>
            </div>

            {/* Form with stagger */}
            <motion.form
              onSubmit={handleSubmit}
              variants={stagger.container}
              initial="hidden"
              animate="show"
              className="space-y-4"
            >
              {!isLogin && (
                <>
                  <motion.div variants={stagger.item} className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-[10px] font-medium text-white/35 tracking-widest uppercase">
                      Nome completo
                    </Label>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-white/20 group-focus-within:text-emerald-400/70 transition-colors duration-200" />
                      <input
                        id="fullName" type="text" placeholder="Seu nome" value={fullName}
                        onChange={(e) => setFullName(e.target.value)} required maxLength={100}
                        className="w-full h-11 pl-9 pr-3 rounded-xl text-sm text-white placeholder:text-white/20 bg-white/[0.03] border border-white/[0.06] outline-none transition-all duration-150 focus:border-emerald-500/40 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/20"
                      />
                    </div>
                  </motion.div>

                  <motion.div variants={stagger.item} className="space-y-1.5">
                    <Label htmlFor="phone" className="text-[10px] font-medium text-white/35 tracking-widest uppercase">
                      Telefone
                    </Label>
                    <div className="relative group">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-white/20 group-focus-within:text-emerald-400/70 transition-colors duration-200" />
                      <input
                        id="phone" type="tel" placeholder="(00) 00000-0000" value={phone}
                        onChange={(e) => setPhone(e.target.value)} required maxLength={20}
                        className="w-full h-11 pl-9 pr-3 rounded-xl text-sm text-white placeholder:text-white/20 bg-white/[0.03] border border-white/[0.06] outline-none transition-all duration-150 focus:border-emerald-500/40 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/20"
                      />
                    </div>
                  </motion.div>
                </>
              )}

              <motion.div variants={stagger.item} className="space-y-1.5">
                <Label htmlFor="email" className="text-[10px] font-medium text-white/35 tracking-widest uppercase">
                  {isLogin ? "E-mail" : "E-mail"}
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-white/20 group-focus-within:text-emerald-400/70 transition-colors duration-200" />
                  <input
                    id="email" type="email" placeholder="seu@email.com" value={email}
                    onChange={(e) => { setEmail(e.target.value); setResolvedLoginEmail(null); }}
                    required maxLength={255}
                    className="w-full h-11 pl-9 pr-3 rounded-xl text-sm text-white placeholder:text-white/20 bg-white/[0.03] border border-white/[0.06] outline-none transition-all duration-150 focus:border-emerald-500/40 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/20"
                  />
                </div>
              </motion.div>

              <motion.div variants={stagger.item} className="space-y-1.5">
                <Label htmlFor="password" className="text-[10px] font-medium text-white/35 tracking-widest uppercase">
                  Senha
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-white/20 group-focus-within:text-emerald-400/70 transition-colors duration-200" />
                  <input
                    id="password" type={showPassword ? "text" : "password"} placeholder="Mínimo 8 caracteres"
                    value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                    className="w-full h-11 pl-9 pr-10 rounded-xl text-sm text-white placeholder:text-white/20 bg-white/[0.03] border border-white/[0.06] outline-none transition-all duration-150 focus:border-emerald-500/40 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/20"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {isLogin && (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer select-none group">
                    <div className="relative">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="peer sr-only" />
                      <div className="w-3.5 h-3.5 rounded border border-white/10 bg-white/[0.03] peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                        {rememberMe && (
                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-white/25 group-hover:text-white/40 transition-colors">Manter conectado</span>
                  </label>
                )}
              </motion.div>

              {/* Primary button */}
              <motion.div variants={stagger.item} className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 sm:h-12 rounded-xl text-[14px] font-semibold text-white relative overflow-hidden transition-all duration-150 hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-60 disabled:pointer-events-none"
                  style={{
                    background: "linear-gradient(135deg, #22c55e 0%, #4ade80 100%)",
                    boxShadow: "0 0 20px -6px rgba(34,197,94,0.35), 0 4px 12px -4px rgba(0,0,0,0.3)",
                  }}
                >
                  {loading ? (
                    <div className="h-4 w-4 mx-auto animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 opacity-60" />
                      {isLogin ? "Entrar" : "Criar conta"}
                    </span>
                  )}
                </button>
              </motion.div>

              {/* Resend confirmation */}
              {showResendConfirm && isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-3 rounded-xl border border-amber-500/15 bg-amber-500/5 text-center space-y-2"
                >
                  <p className="text-xs text-amber-200/70 font-medium">Seu e-mail ainda não foi confirmado.</p>
                  <button
                    type="button" onClick={handleResendConfirmation} disabled={resendLoading}
                    className="w-full py-2 rounded-lg text-xs font-semibold bg-emerald-500/90 hover:bg-emerald-500 text-white transition-colors"
                  >
                    {resendLoading ? "Reenviando..." : "📧 Reenviar e-mail de confirmação"}
                  </button>
                </motion.div>
              )}
            </motion.form>

            {/* Security */}
            <div className="flex items-center justify-center gap-1.5 mt-5 text-[9px] text-white/15 font-medium tracking-wider uppercase">
              <ShieldCheck className="w-3 h-3" />
              <span>Ambiente seguro e criptografado</span>
            </div>

            {/* Divider */}
            <div className="my-5 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)" }} />

            {/* Secondary action */}
            <div className="text-center">
              <p className="text-[12px] text-white/25 mb-2.5">
                {isLogin ? "Não tem conta?" : "Já tem conta?"}
              </p>
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold border transition-all duration-150 hover:-translate-y-[0.5px]"
                style={{
                  borderColor: "rgba(251,191,36,0.2)",
                  background: "transparent",
                  color: "#fbbf24",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,191,36,0.04)"; e.currentTarget.style.borderColor = "rgba(251,191,36,0.35)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(251,191,36,0.2)"; }}
              >
                {isLogin ? "Criar conta gratuita" : "Fazer login"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* WhatsApp */}
      <a
        href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
        target="_blank" rel="noopener noreferrer"
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full flex items-center justify-center transition-transform duration-150 hover:scale-105"
        style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 16px -4px rgba(34,197,94,0.4)" }}
      >
        <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  );
};

export default Auth;
