import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ArrowLeft, User, Phone, Mail, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, RefreshCw } from "lucide-react";
import logo from "@/assets/dg-contingencia-avatar.png";

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
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const inputClass = "w-full h-12 px-4 rounded-xl text-sm text-white/90 placeholder:text-white/25 outline-none transition-all duration-200 bg-white/[0.035] border border-white/[0.07] focus:border-emerald-500/30 focus:bg-white/[0.05] focus:ring-1 focus:ring-emerald-500/15";

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 relative overflow-hidden" style={{ background: "#0c0c0c" }}>
      {/* Soft ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04]"
          style={{ background: "radial-gradient(circle, #34d399, transparent 70%)" }} />
      </div>

      {/* Back button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 z-20 flex items-center gap-1.5 text-xs font-medium text-white/25 hover:text-white/50 transition-colors group"
      >
        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        Voltar
      </motion.button>

      <div className="w-full max-w-[420px] flex flex-col items-center relative z-10">
        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full rounded-3xl overflow-hidden backdrop-blur-sm"
          style={{
            background: "linear-gradient(180deg, rgba(20,20,22,0.92) 0%, rgba(14,14,16,0.96) 100%)",
            border: "1px solid rgba(255,255,255,0.05)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.02), 0 32px 80px -20px rgba(0,0,0,0.6)",
          }}
        >
          <div className="px-9 pt-10 pb-10">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex flex-col items-center mb-8"
            >
              <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4 ring-1 ring-white/[0.06]" style={{
                boxShadow: "0 0 30px rgba(52,211,153,0.08)",
              }}>
                <img src={logo} alt="DG Contingência Pro" className="w-full h-full object-cover" />
              </div>
              <h1 className="text-[20px] font-semibold text-white/90 tracking-tight">DG Contingência Pro</h1>
              <p className="text-[13px] text-white/25 mt-1 font-light">
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
                  required minLength={8}
                  className={`${inputClass} pr-11`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </motion.div>

              {isLogin && (
                <motion.label variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
                  className="flex items-center gap-2 cursor-pointer select-none group pt-0.5">
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
                </motion.label>
              )}

              {/* Submit */}
              <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="pt-1.5">
                <button type="submit" disabled={loading}
                  className="w-full h-12 rounded-xl text-[14px] font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
                  style={{
                    background: "linear-gradient(135deg, rgba(52,211,153,0.2) 0%, rgba(52,211,153,0.08) 100%)",
                    border: "1px solid rgba(52,211,153,0.15)",
                    boxShadow: "0 0 20px -8px rgba(52,211,153,0.15)",
                  }}>
                  {loading ? (
                    <div className="h-4 w-4 mx-auto animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    isLogin ? "Entrar" : "Criar conta"
                  )}
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
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-[10px] text-white/15 mt-7 text-center tracking-wide uppercase font-medium">
          Ambiente seguro e criptografado
        </motion.p>
      </div>

      {/* WhatsApp */}
      <a href="https://wa.me/5562994192500?text=Ol%C3%A1%2C%20vim%20do%20site%20da%20DG%20Conting%C3%AAncia%20PRO%20e%20preciso%20de%20suporte."
        target="_blank" rel="noopener noreferrer"
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full flex items-center justify-center transition-transform duration-150 hover:scale-105"
        style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 16px -4px rgba(34,197,94,0.4)" }}>
        <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  );
};

export default Auth;
