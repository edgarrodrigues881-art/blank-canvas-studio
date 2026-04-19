import { useState } from "react";
import { PlayCircle, Hourglass, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutorialModal } from "@/components/TutorialModal";
import { TUTORIALS, type TutorialItem } from "@/lib/tutorials";

export default function TutorialsPage() {
  const [active, setActive] = useState<TutorialItem | null>(null);

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          Central de Aprendizado
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vídeos curtos por função. Você também encontra cada aula direto na página correspondente.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/50 overflow-hidden">
        {TUTORIALS.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
              <p className="text-xs text-muted-foreground truncate">{t.description}</p>
            </div>
            {t.videoUrl ? (
              <Button size="sm" variant="outline" onClick={() => setActive(t)} className="gap-1.5 shrink-0">
                <PlayCircle className="w-3.5 h-3.5" /> Assistir
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1 shrink-0">
                <Hourglass className="w-3 h-3" /> Em breve
              </span>
            )}
          </div>
        ))}
      </div>

      <TutorialModal tutorial={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}
