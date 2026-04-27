import { Eye, EyeOff, ShieldOff, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatPrivacy, type ChatPrivacyMode } from "@/hooks/chat/useChatPrivacy";
import { cn } from "@/lib/utils";

const OPTIONS: { key: ChatPrivacyMode; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "normal", label: "Normal", description: "Mostra tudo (padrão)", icon: Eye },
  { key: "hide_messages", label: "Ocultar mensagens", description: "Borra apenas o conteúdo das mensagens", icon: ShieldOff },
  { key: "hide_all", label: "Ocultar tudo", description: "Borra nome, foto e mensagens", icon: Shield },
];

interface Props {
  className?: string;
  size?: "sm" | "icon";
}

export function PrivacyToggle({ className, size = "icon" }: Props) {
  const { mode, setMode } = useChatPrivacy();
  const active = OPTIONS.find((o) => o.key === mode) || OPTIONS[0];
  const Icon = mode === "normal" ? Eye : EyeOff;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={cn(
            "h-8 w-8 text-muted-foreground hover:text-foreground transition-colors",
            mode !== "normal" && "text-primary hover:text-primary",
            className,
          )}
          title={`Privacidade: ${active.label}`}
        >
          <Icon className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Privacidade do chat
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((opt) => {
          const OptIcon = opt.icon;
          const isActive = opt.key === mode;
          return (
            <DropdownMenuItem
              key={opt.key}
              onClick={() => setMode(opt.key)}
              className={cn("gap-2 cursor-pointer items-start py-2", isActive && "bg-muted")}
            >
              <OptIcon className={cn("w-4 h-4 mt-0.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
              <div className="flex flex-col min-w-0">
                <span className={cn("text-[12.5px] font-semibold", isActive && "text-primary")}>{opt.label}</span>
                <span className="text-[11px] text-muted-foreground leading-snug">{opt.description}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
