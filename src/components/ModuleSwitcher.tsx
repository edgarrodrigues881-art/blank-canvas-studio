import { Headset, UsersRound, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWorkspace, type Workspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/utils";

const MODULES: { key: Workspace; label: string; icon: any; route: string; activeColor: string }[] = [
  { key: "crm", label: "CRM", icon: Headset, route: "/dashboard/crm", activeColor: "text-sky-400" },
  { key: "groups", label: "Gestão de Grupos", icon: UsersRound, route: "/dashboard/groups-dashboard", activeColor: "text-violet-400" },
  { key: "automacao", label: "Aquecimento", icon: Flame, route: "/dashboard/warmup-v2", activeColor: "text-orange-400" },
];

export function ModuleSwitcher() {
  const { workspace, setWorkspace } = useWorkspace();
  const navigate = useNavigate();

  return (
    <div className="w-full border-b border-border/50 bg-card/40 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 px-3 sm:px-5 md:px-8 py-2 overflow-x-auto">
        {MODULES.map((m) => {
          const active = workspace === m.key;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => {
                setWorkspace(m.key);
                navigate(m.route);
              }}
              className={cn(
                "group relative flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-200",
                active
                  ? "bg-primary/15 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_4px_20px_-6px_hsl(var(--primary)/0.4)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <Icon
                className={cn(
                  "w-[16px] h-[16px] shrink-0 transition-colors",
                  active ? m.activeColor : "text-muted-foreground/70 group-hover:text-foreground"
                )}
                strokeWidth={active ? 2.4 : 1.8}
              />
              <span className={cn(active && "font-semibold tracking-tight")}>{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ModuleSwitcher;
