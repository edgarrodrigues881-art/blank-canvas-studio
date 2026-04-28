import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ArrowLeft, User, Phone, Mail, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, RefreshCw } from "lucide-react";
import logo from "@/assets/dg-contingencia-pro-logo.jpeg";

const translateAuthError = (msg: string): string => {
  const map: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
    "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos.",
    "For security purposes, you can only request this after 60 seconds.": "Aguarde 60 segundos antes de tentar novamente.",
    "User not found": "Usuário não encontrado.",
    "User already registered": "Este e-mail já está cadastrado.",
    "Signup requires a valid password": "Informe uma senha válida.",
    "Password should be at least 6 characters": "A senha deve ter no mínimo 6 caracteres.",
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

const Auth = () => {
  const { backendDown, retryConnection } = useAuth();
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showResendConfirm, setShowResendConfirm] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resolvedLoginEmail, setResolvedLoginEmail] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = forgotEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast({ title: "E-mail inválido", description: "Informe um e-mail válido.", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: "E-mail enviado!",
        description: "Se houver uma conta com esse e-mail, você receberá um link para redefinir a senha.",
      });
      setShowForgotPassword(false);
      setForgotEmail("");
    } catch (error: any) {
      toast({ title: "Erro", description: translateAuthError(error.message || ""), variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  useEffect(() => {
    setIsLogin(searchParams.get("mode") !== "signup");
  }, [searchParams]);

  const redirectTo = searchParams.get("redirect") || "/dashboard";

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
      toast({ title: "E-mail reenviado!", description: "Verifique sua caixa de entrada (e spam)." });
      setShowResendConfirm(false);
    } catch (error: any) {
      toast({ title: "Erro", description: translateAuthError(error.message), variant: "destructive" });
    } finally {
      setResendLoading(false);
    }
  };

  const resolveLoginEmail = async (identifier: string, rawPassword: string) => {
    const trimmedIdentifier = identifier.trim();
    if (!isPhoneIdentifier(trimmedIdentifier)) return trimmedIdentifier.toLowerCase();

    const normalizedIdentifier = isPhoneIdentifier(trimmedIdentifier)
      ? normalizePhone(trimmedIdentifier)
      : trimmedIdentifier.toLowerCase();
    const { data, error } = await supabase.functions.invoke("legacy-login", {
      body: { identifier: normalizedIdentifier, password: rawPassword },
    });
    if (error) {
      if (!isPhoneIdentifier(trimmedIdentifier)) return trimmedIdentifier;
      throw new Error(data?.error || error.message || "Não foi possível localizar sua conta.");
    }
    if (!data?.email) return trimmedIdentifier;
    return data.email as string;
  };

  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      navigate(redirectTo, { replace: true });
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
        // Atalho de login rápido para conta DG (somente esta conta)
        let effectiveEmail = email;
        let effectivePassword = password;
        if (email.trim().toLowerCase() === "dg" && password === "881") {
          effectiveEmail = "dg@dg-login.local";
          effectivePassword = "88188188";
        }
        const loginEmail = await resolveLoginEmail(effectiveEmail, effectivePassword);
        setResolvedLoginEmail(loginEmail);
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: effectivePassword });
        if (error) throw error;
        localStorage.setItem("dg_remember_me", rememberMe ? "true" : "false");
        if (!rememberMe) sessionStorage.setItem("dg_session_alive", "true");
        else sessionStorage.removeItem("dg_session_alive");
        // Mark welcome as shown BEFORE navigating to prevent onAuthStateChange from doing a competing full-page reload
        if (signInData?.user) {
          localStorage.setItem(`dg_welcome_shown_${signInData.user.id}`, "true");
        }
        navigate(`/welcome?to=${encodeURIComponent(redirectTo)}`);
      } else {
        const trimmedPhone = phone.trim().replace(/\D/g, "");
        if (!trimmedPhone || trimmedPhone.length < 10) {
          toast({ title: "Telefone inválido", description: "Informe um número de telefone válido.", variant: "destructive" });
          setLoading(false);
          return;
        }
        const { data: phoneAvailable } = await supabase.rpc("check_phone_available", { _phone: trimmedPhone });
        if (phoneAvailable === false) {
          toast({ title: "Telefone já cadastrado", description: "Este número já está vinculado a outra conta.", variant: "destructive" });
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim(), phone: trimmedPhone },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({ title: "Conta criada!", description: "Verifique seu email para confirmar o cadastro." });
      }
    } catch (error: any) {
      const rawMsg = error.message || "";
      if (isTimeoutError(rawMsg)) {
        toast({ title: "Servidor indisponível", description: "Tente novamente em alguns minutos.", variant: "destructive" });
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

  const inputClass = "w-full h-12 px-4 rounded-lg text-sm text-white placeholder:text-gray-500 outline-none transition-all duration-200 bg-black/40 border border-emerald-500/10 hover:border-emerald-500/20 hover:bg-black/60 focus:border-emerald-500/50 focus:bg-black/60 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.15)]";

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 relative overflow-hidden bg-black">
      {/* Subtle green grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16,185,129,1) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      {/* Soft green ambient glow behind card */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 60%)", filter: "blur(60px)" }}
      />

      {/* Back button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        onClick={() => navigate("/")}
        aria-label="Voltar"
        className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20 p-1.5 text-white/25 hover:text-white/60 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
      </motion.button>

      <div className="w-full max-w-[420px] flex flex-col items-center relative z-10">
        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full rounded-3xl overflow-hidden backdrop-blur-2xl relative"
          style={{
            background: "linear-gradient(180deg, rgba(26,26,30,0.72) 0%, rgba(14,14,18,0.86) 100%)",
            border: "1px solid rgba(255,255,255,0.09)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 1px 0 0 rgba(255,255,255,0.08) inset, 0 -1px 0 0 rgba(255,255,255,0.02) inset, 0 60px 140px -30px rgba(0,0,0,0.9), 0 0 100px -40px rgba(52,211,153,0.14)",
          }}
        >
          {/* Top highlight — brighter for visible edge */}
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          {/* Soft side highlights */}
          <div className="pointer-events-none absolute inset-y-10 left-0 w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />
          <div className="pointer-events-none absolute inset-y-10 right-0 w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />

          <div className="px-9 pt-10 pb-10">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex flex-col items-center mb-9"
            >
              <div className="relative mb-5">
                {/* Focused logo glow — tight, behind logo only */}
                <div className="absolute inset-0 -m-6 rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(52,211,153,0.38) 0%, rgba(52,211,153,0.08) 40%, transparent 70%)", filter: "blur(24px)" }} />
                <div className="relative w-[92px] h-[92px] rounded-2xl overflow-hidden ring-1 ring-white/[0.12]"
                  style={{ boxShadow: "0 12px 48px -10px rgba(52,211,153,0.45), inset 0 1px 0 0 rgba(255,255,255,0.12)" }}>
                  <img src={logo} alt="DG Contingência Pro" className="w-full h-full object-cover" />
                </div>
              </div>
              <h1 className="text-[21px] font-semibold text-white tracking-tight">
                <span style={{ color: "#34d399" }}>DG</span> Contingência <span style={{ color: "#34d399" }}>Pro</span>
              </h1>
              <p className="text-[13px] text-white/55 mt-1.5 font-normal tracking-tight">
                {isLogin ? "Entre na sua conta" : "Crie sua conta"}
              </p>
            </motion.div>

            {/* Backend down alert */}
            {backendDown && (
              <div className="mb-5 p-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] text-amber-300/80 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div className="text-left flex-1">
                  <p className="font-medium text-[11px]">Servidor temporariamente indisponível</p>
                </div>
                <button type="button" onClick={retryConnection} className="shrink-0 p-1 rounded-lg hover:bg-amber-500/10 transition-colors" title="Tentar reconectar">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Form */}
            <motion.form
              onSubmit={handleSubmit}
              className="space-y-3.5"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            >
              {!isLogin && (
                <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                  <input type="text" placeholder="Nome completo" value={fullName}
                    onChange={(e) => setFullName(e.target.value)} required maxLength={100}
                    className={inputClass} />
                </motion.div>
              )}

              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                <input type={isLogin ? "text" : "email"}
                  placeholder={isLogin ? "E-mail ou telefone" : "E-mail"}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setResolvedLoginEmail(null); }}
                  required maxLength={255}
                  className={inputClass} />
              </motion.div>

              {!isLogin && (
                <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}>
                  <input type="tel" placeholder="Número de telefone" value={phone}
                    onChange={(e) => setPhone(e.target.value)} required maxLength={20}
                    className={inputClass} />
                </motion.div>
              )}

              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="relative">
                <input type={showPassword ? "text" : "password"}
                  placeholder={isLogin ? "Senha" : "Senha (mínimo 8 caracteres)"}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={isLogin ? 1 : 8}
                  className={`${inputClass} pr-11`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </motion.div>

              {isLogin && (
                <motion.label variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                  className="flex items-center justify-between gap-2 cursor-pointer select-none group pt-0.5">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="peer sr-only" />
                      <div className="w-3.5 h-3.5 rounded-[4px] border border-white/10 bg-white/[0.03] peer-checked:bg-emerald-500/80 peer-checked:border-emerald-500/80 transition-all flex items-center justify-center">
                        {rememberMe && (
                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-white/25 group-hover:text-white/40 transition-colors">Manter conectado</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setForgotEmail(email.trim()); setShowForgotPassword(true); }}
                    className="text-[11px] text-emerald-400/70 hover:text-emerald-300 transition-colors underline-offset-2 hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </motion.label>
              )}

              {/* Submit */}
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="pt-1.5">
                <button type="submit" disabled={loading}
                  className="w-full h-12 rounded-xl text-[14px] font-semibold text-white transition-all duration-300 ease-out hover:scale-[1.02] hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden group"
                  style={{
                    background: "linear-gradient(135deg, rgba(52,211,153,0.35) 0%, rgba(16,185,129,0.18) 100%)",
                    border: "1px solid rgba(52,211,153,0.28)",
                    boxShadow: "0 0 30px -8px rgba(52,211,153,0.45), inset 0 1px 0 0 rgba(255,255,255,0.12)",
                  }}>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
                  <span className="relative">
                    {loading ? (
                      <div className="h-4 w-4 mx-auto animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      isLogin ? "Entrar" : "Criar conta"
                    )}
                  </span>
                </button>
              </motion.div>

              {showResendConfirm && isLogin && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  className="p-3 rounded-xl border border-amber-500/10 bg-amber-500/[0.03] text-center space-y-2">
                  <p className="text-xs text-amber-200/60 font-medium">Seu e-mail ainda não foi confirmado.</p>
                  <button type="button" onClick={handleResendConfirmation} disabled={resendLoading}
                    className="w-full py-2 rounded-lg text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] text-white/80 transition-colors">
                    {resendLoading ? "Reenviando..." : "📧 Reenviar e-mail de confirmação"}
                  </button>
                </motion.div>
              )}
            </motion.form>

            {/* Divider */}
            <div className="my-6 h-[1px]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)" }} />

            {/* Toggle */}
            <div className="text-center">
              <p className="text-[12px] text-white/20 mb-2.5">
                {isLogin ? "Não tem conta?" : "Já tem conta?"}
              </p>
              <button onClick={() => setIsLogin(!isLogin)}
                className="w-full py-2.5 rounded-xl text-[13px] font-medium border transition-all duration-200 text-white/40 hover:text-white/60 hover:bg-white/[0.02]"
                style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                {isLogin ? "Criar conta gratuita" : "Fazer login"}
              </button>

              {/* Direct WhatsApp link */}
              <p className="mt-4 text-[12px] text-white/30 font-normal">
                Precisa de ajuda?{" "}
                <a
                  href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
                  target="_blank" rel="noopener noreferrer"
                  className="text-white/55 hover:text-white/85 underline underline-offset-2 decoration-white/20 hover:decoration-white/40 transition-colors"
                >
                  Falar no WhatsApp
                </a>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-[10px] text-white/15 mt-7 text-center tracking-wide uppercase font-medium">
          Ambiente seguro e criptografado
        </motion.p>
      </div>

      {/* Forgot password modal */}
      {showForgotPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5 backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !forgotLoading && setShowForgotPassword(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-[400px] rounded-2xl p-7 relative"
            style={{
              background: "linear-gradient(180deg, rgba(26,26,30,0.96) 0%, rgba(14,14,18,0.98) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 40px 100px -20px rgba(0,0,0,0.8), 0 0 60px -20px rgba(52,211,153,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[17px] font-semibold text-white mb-1.5">Recuperar senha</h2>
            <p className="text-[12px] text-white/45 mb-5 leading-relaxed">
              Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha.
            </p>
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <input
                type="email"
                placeholder="seu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                maxLength={255}
                autoFocus
                className={inputClass}
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  disabled={forgotLoading}
                  className="flex-1 h-11 rounded-xl text-[13px] font-medium text-white/55 hover:text-white/80 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 h-11 rounded-xl text-[13px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                  style={{
                    background: "linear-gradient(135deg, rgba(52,211,153,0.4) 0%, rgba(16,185,129,0.22) 100%)",
                    border: "1px solid rgba(52,211,153,0.32)",
                    boxShadow: "0 0 24px -8px rgba(52,211,153,0.45)",
                  }}
                >
                  {forgotLoading ? (
                    <div className="h-4 w-4 mx-auto animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    "Enviar link"
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Auth;
