import { useState } from "react";
import { useLocation } from "react-router-dom";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutorialModal } from "@/components/TutorialModal";
import { getTutorialForRoute } from "@/lib/tutorials";

interface Props {
  /** Override automatic route detection */
  tutorialId?: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "default";
  className?: string;
}

/**
 * Contextual button that opens the tutorial relevant to the current page.
 * Renders nothing when no tutorial is registered for the current route.
 */
export const HowToUseButton = ({ tutorialId, size = "sm", variant = "outline", className }: Props) => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const tutorial = getTutorialForRoute(pathname);
  const target = tutorialId ? null : tutorial;
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
