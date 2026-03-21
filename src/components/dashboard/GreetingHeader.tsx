import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";

export function GreetingHeader() {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const emoji = hour < 12 ? "☀️" : hour < 18 ? "🌤️" : "🌙";

  const name = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "Usuário";

  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-0.5 sm:space-y-1">
      <h1 className="text-base sm:text-2xl font-bold text-foreground leading-snug">
        {greeting}, {name} {emoji}
      </h1>
      <p className="text-[11px] sm:text-sm text-muted-foreground capitalize">{dateStr}</p>
    </div>
  );
}
