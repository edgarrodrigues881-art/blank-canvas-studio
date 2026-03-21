import { useNavigate } from "react-router-dom";
import { Plus, UserPlus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { label: "Nova Campanha", icon: Plus, path: "/dashboard/campaigns", color: "text-emerald-400" },
  { label: "Adicionar Contato", icon: UserPlus, path: "/dashboard/contacts", color: "text-violet-400" },
  { label: "Conectar Chip", icon: Smartphone, path: "/dashboard/devices", color: "text-teal-400" },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {actions.map((a) => (
        <Button
          key={a.label}
          variant="outline"
          size="sm"
          onClick={() => navigate(a.path)}
          className="border-border/50 bg-card/50 hover:bg-muted/50 gap-1.5 sm:gap-2 text-[11px] sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3"
        >
          <a.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${a.color}`} />
          <span className="hidden xs:inline">{a.label}</span>
          <span className="xs:hidden">{a.label.split(" ").pop()}</span>
        </Button>
      ))}
    </div>
  );
}
