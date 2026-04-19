import { useState } from "react";
import { PlayCircle, GraduationCap, Sparkles } from "lucide-react";
import { TutorialModal } from "@/components/TutorialModal";
import { CRM_TUTORIALS, CRM_CATEGORY_ORDER, type CrmTutorialItem } from "@/lib/crmTutorials";
import type { TutorialItem } from "@/lib/tutorials";

export default function CrmLearningPage() {
  const [active, setActive] = useState<CrmTutorialItem | null>(null);

  const intro = CRM_TUTORIALS.find((t) => t.intro);
  const items = CRM_TUTORIALS.filter((t) => !t.intro);

  const toModal = (t: CrmTutorialItem | null): TutorialItem | null =>
    t ? { id: t.id, title: t.title, subtitle: t.subtitle, category: "Conexões", videoUrl: t.videoUrl } : null;

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          Guia do CRM
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprenda cada função do CRM com vídeos curtos e diretos.
        </p>
      </div>

      {/* Intro highlight */}
      {intro && (
        <button
          type="button"
          onClick={() => setActive(intro)}
          className="group w-full text-left rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card overflow-hidden shadow-sm transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
        >
          <div className="flex flex-col sm:flex-row items-stretch">
            <div className="relative sm:w-64 aspect-video sm:aspect-auto bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_hsl(var(--primary)/0.18),_transparent_70%)]" />
              <div className="relative w-14 h-14 rounded-full bg-primary/20 backdrop-blur-sm ring-1 ring-primary/30 flex items-center justify-center transition-transform group-hover:scale-110">
                <PlayCircle className="w-7 h-7 text-primary" />
              </div>
            </div>
            <div className="flex-1 px-5 py-4 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="w-3 h-3" /> Comece por aqui
              </div>
              <p className="text-base font-semibold text-foreground">{intro.title}</p>
              <p className="text-sm text-muted-foreground">{intro.subtitle}</p>
            </div>
          </div>
        </button>
      )}

      {/* Categories */}
      {CRM_CATEGORY_ORDER.map((category) => {
        const list = items.filter((t) => t.category === category);
        if (list.length === 0) return null;
        return (
          <section key={category} className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground/90 tracking-tight">{category}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((t) => (
                <CrmTutorialCard key={t.id} tutorial={t} onOpen={() => setActive(t)} />
              ))}
            </div>
          </section>
        );
      })}

      <TutorialModal tutorial={toModal(active)} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}

function CrmTutorialCard({ tutorial, onOpen }: { tutorial: CrmTutorialItem; onOpen: () => void }) {
  const hasVideo = !!tutorial.videoUrl;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative aspect-video bg-gradient-to-br from-muted/60 to-muted/20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_hsl(var(--primary)/0.08),_transparent_70%)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-background/40 backdrop-blur-sm ring-1 ring-border/50 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:bg-primary/15 group-hover:ring-primary/40">
            <PlayCircle className="w-7 h-7 text-foreground/80 group-hover:text-primary transition-colors" />
          </div>
        </div>
        {!hasVideo && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-background/70 backdrop-blur text-muted-foreground border border-border/50">
            Em breve
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{tutorial.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{tutorial.subtitle}</p>
      </div>
    </button>
  );
}
