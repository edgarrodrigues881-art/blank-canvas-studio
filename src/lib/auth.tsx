import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

// ── Contingency mode: stop refresh loops when backend is down ──
let backendDownSince: number | null = null;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;
const BACKOFF_BASE_MS = 30_000; // 30s base backoff
const MAX_BACKOFF_MS = 300_000; // 5min max

function markBackendFailure() {
  consecutiveFailures++;
  if (!backendDownSince) backendDownSince = Date.now();
  // Disable auto-refresh to stop the retry loop
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    supabase.auth.stopAutoRefresh();
    console.warn(`[auth-contingency] Backend down — auto-refresh paused after ${consecutiveFailures} failures`);
  }
}

function markBackendRecovered() {
  if (consecutiveFailures > 0) {
    console.info("[auth-contingency] Backend recovered — resuming auto-refresh");
  }
  consecutiveFailures = 0;
  backendDownSince = null;
  supabase.auth.startAutoRefresh();
}

export function isBackendDown() {
  return consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

function isInvalidPersistedSession(message?: string | null) {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("session not found") ||
    normalized.includes("session from session_id claim") ||
    normalized.includes("invalid jwt") ||
    normalized.includes("jwt expired") ||
    normalized.includes("user from sub claim")
  );
}

async function clearInvalidLocalSession() {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (projectId) {
    localStorage.removeItem(`sb-${projectId}-auth-token`);
  }
  sessionStorage.removeItem("dg_session_alive");
  await supabase.auth.signOut({ scope: "local" });
}

// Record login IP — throttled via localStorage (5 min cooldown)
function recordLoginIp(userId: string) {
  const ipKey = `login_ip_${userId}`;
  const last = localStorage.getItem(ipKey);
  if (last && Date.now() - parseInt(last) < 5 * 60 * 1000) return;

  localStorage.setItem(ipKey, Date.now().toString());
  fetch("https://api.ipify.org?format=json")
    .then(r => r.json())
    .then(({ ip }) => {
      if (ip) {
        supabase.functions.invoke("record-login-ip", {
          body: { ip_address: ip, user_agent: navigator.userAgent },
        }).catch(() => localStorage.removeItem(ipKey));
      }
    })
    .catch(() => localStorage.removeItem(ipKey));
}


async function getValidatedSession() {
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  if (!currentSession?.access_token) return null;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(currentSession.access_token);

  if (error) {
    if (isInvalidPersistedSession(error.message)) {
      console.warn("[auth] Sessão local inválida detectada. Limpando credenciais locais.");
      await clearInvalidLocalSession();
      return null;
    }
    throw error;
  }

  if (!user) {
    await clearInvalidLocalSession();
    return null;
  }

  return currentSession;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  backendDown: boolean;
  retryConnection: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  backendDown: false,
  retryConnection: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendDown, setBackendDown] = useState(false);
  const isSigningOut = useRef(false);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Periodic health check when backend is down
  useEffect(() => {
    if (!backendDown) {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
      return;
    }

    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`,
          {
            headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);
        if (res.ok) {
          markBackendRecovered();
          setBackendDown(false);
        }
      } catch {
        // still down
      }
    };

    // Check every 30s
    healthCheckRef.current = setInterval(check, 30_000);
    return () => {
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
    };
  }, [backendDown]);

  const retryConnection = useCallback(async () => {
    markBackendRecovered();
    setBackendDown(false);
    setLoading(true);
    try {
      const s = await getValidatedSession();
      setSession(s);
      setUser(s?.user ?? null);
    } catch {
      markBackendFailure();
      setBackendDown(isBackendDown());
    } finally {
      setLoading(false);
    }
  }, []);

  // Single effect: init auth + handle "Manter conectado"
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      // 1. Check "remember me" BEFORE doing anything
      const remember = localStorage.getItem("dg_remember_me");
      const sessionAlive = sessionStorage.getItem("dg_session_alive");
      const shouldClearSession = remember === "false" && !sessionAlive;

      if (shouldClearSession) {
        // Clear EVERYTHING before Supabase client can use the token
        localStorage.removeItem("dg_remember_me");
        sessionStorage.removeItem("dg_session_alive");
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        if (projectId) {
          localStorage.removeItem(`sb-${projectId}-auth-token`);
        }
        // Sign out to clear Supabase client internal state
        try {
          await supabase.auth.signOut();
        } catch {
          // Ignore errors during cleanup signout
        }
        if (isMounted) {
          setSession(null);
          setUser(null);
          setLoading(false);
        }
        return null; // No need to set up listener
      }

      // 2. Normal flow: get session first
      try {
        const currentSession = await getValidatedSession();
        if (!isMounted) return null;
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        markBackendRecovered();
        if (isMounted) setBackendDown(false);
        // Record IP on initial session load too
        if (currentSession?.user) {
          recordLoginIp(currentSession.user.id);
        }
        if (remember === "false") {
          sessionStorage.setItem("dg_session_alive", "true");
        }
      } catch (err) {
        console.error("Error initializing auth:", err);
        markBackendFailure();
        if (isMounted) setBackendDown(isBackendDown());
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }

      // 3. Set up listener AFTER initial load (for ongoing changes only)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, newSession) => {
          if (!isMounted) return;

          if (event === "SIGNED_OUT") {
            setSession(null);
            setUser(null);
            return;
          }

          if (newSession) {
            setSession(newSession);
            setUser(newSession.user ?? null);
            markBackendRecovered();
            if (isMounted) setBackendDown(false);

            // Auto-provision trial tokens on first sign-in (debounced + idempotent)
            if (event === "SIGNED_IN") {
              const provisionKey = `provision_trial_${newSession.user.id}`;
              const lastProvision = sessionStorage.getItem(provisionKey);
              if (!lastProvision) {
                sessionStorage.setItem(provisionKey, Date.now().toString());
                supabase.functions.invoke("provision-trial").catch((err) => {
                  console.warn("[auth] Trial provision failed (non-blocking):", err);
                  sessionStorage.removeItem(provisionKey);
                });
              }

              // Redirect to Welcome splash on first login (email confirmation redirect)
              // Never hijack the dedicated backoffice entry flow.
              const currentPath = window.location.pathname + window.location.search;
              const isBackofficeRoute = window.location.pathname.startsWith("/backoffice");
              const welcomeShown = localStorage.getItem(`dg_welcome_shown_${newSession.user.id}`);
              if (!welcomeShown && window.location.pathname !== "/welcome" && !isBackofficeRoute) {
                localStorage.setItem(`dg_welcome_shown_${newSession.user.id}`, "true");
                const redirectTo = currentPath.startsWith("/dashboard") ? currentPath : "/dashboard";
                window.location.href = `/welcome?to=${encodeURIComponent(redirectTo)}`;
              }

              // Record login IP (non-blocking, throttled 5min via localStorage)
              recordLoginIp(newSession.user.id);
            }
          }
          // Detect TOKEN_REFRESHED failure (event fires but session is null = failure)
          if (!newSession && event === "TOKEN_REFRESHED") {
            markBackendFailure();
            if (isMounted) setBackendDown(isBackendDown());
          }
        }
      );

      return subscription;
    };

    let subscription: ReturnType<typeof supabase.auth.onAuthStateChange>["data"]["subscription"] | null = null;

    initAuth().then((sub) => {
      subscription = sub;
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    isSigningOut.current = true;
    localStorage.removeItem("dg_remember_me");
    sessionStorage.removeItem("dg_session_alive");
    setSession(null);
    setUser(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, backendDown, retryConnection, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { session, loading, backendDown } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session && !backendDown) {
      // Preserve current path so user returns here after login
      const currentPath = window.location.pathname + window.location.search;
      const redirectParam = currentPath !== "/auth" ? `?redirect=${encodeURIComponent(currentPath)}` : "";
      navigate(`/auth${redirectParam}`, { replace: true });
    }
  }, [session, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        {backendDown ? (
          <div className="flex flex-col items-center gap-3 text-center px-4">
            <div className="text-amber-400 text-lg font-bold">Servidor indisponível</div>
            <p className="text-muted-foreground text-sm max-w-xs">O sistema está temporariamente fora do ar. O acesso será restaurado automaticamente.</p>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        )}
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
};
