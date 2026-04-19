import { useState } from "react";
import { PlayCircle, GraduationCap } from "lucide-react";
import { TutorialModal } from "@/components/TutorialModal";
import { TUTORIALS, CATEGORY_ORDER, type TutorialItem } from "@/lib/tutorials";

export default function TutorialsPage() {
  const [active, setActive] = useState<TutorialItem | null>(null);

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          Central de Aprendizado
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vídeos curtos por função para você aprender no seu ritmo.
        </p>
      </div>

      {/* Categories */}
      {CATEGORY_ORDER.map((category) => {
        const items = TUTORIALS.filter((t) => t.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-4">
            <h2 className="text-sm font-semibold text-foreground/90 tracking-tight">{category}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((t) => (
                <TutorialCard key={t.id} tutorial={t} onOpen={() => setActive(t)} />
              ))}
            </div>
          </section>
        );
      })}

      <TutorialModal tutorial={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}

function TutorialCard({ tutorial, onOpen }: { tutorial: TutorialItem; onOpen: () => void }) {
  const hasVideo = !!tutorial.videoUrl;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* Thumbnail */}
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
      {/* Content */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {tutorial.title}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{tutorial.subtitle}</p>
      </div>
    </button>
  );
}
