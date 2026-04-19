import { useState } from "react";
import { useLocation } from "react-router-dom";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutorialModal } from "@/components/TutorialModal";
import { getTutorialForRoute, type TutorialItem } from "@/lib/tutorials";
import { getCrmTutorialForRoute } from "@/lib/crmTutorials";

interface Props {
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "default";
  className?: string;
}

/**
 * Contextual button that opens the tutorial relevant to the current page.
 * Auto-detects CRM vs general tutorials by route. Renders nothing if none registered.
 */
export const HowToUseButton = ({ size = "sm", variant = "outline", className }: Props) => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const crm = getCrmTutorialForRoute(pathname);
  const general = getTutorialForRoute(pathname);
  const target: TutorialItem | null = crm
    ? { id: crm.id, title: crm.title, subtitle: crm.subtitle, category: "Conexões", videoUrl: crm.videoUrl }
    : general || null;

  if (!target) return null;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} className={`gap-1.5 ${className || ""}`}>
        <PlayCircle className="w-3.5 h-3.5" />
        Ver como usar
      </Button>
      <TutorialModal tutorial={target} open={open} onOpenChange={setOpen} />
    </>
  );
};
