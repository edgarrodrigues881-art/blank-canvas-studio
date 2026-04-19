import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PlayCircle, Search, Clock, ArrowRight, CheckCircle2, Circle, Sparkles, Rocket, Send, Flame, Zap, Hourglass } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Tutorial {
  id: string;
  title: string;
  description: string;
  videoUrl: string | null;
  duration: string;
  category: string;
  steps?: string[];
  featurePath?: string;
  featured?: boolean;
}

const STORAGE_KEY = "tutorials_watched_v1";

const tutorials: Tutorial[] = [
  {
    id: "1",
    title: "Comece por aqui — Tour completo da plataforma",
    description: "Visão geral em 5 minutos: conecte seu chip, configure e envie sua primeira mensagem.",
    videoUrl: null,
    duration: "5:30",
    category: "Início",
    steps: ["Conectar chip", "Escanear QR", "Validar conexão"],
    featurePath: "/dashboard/warmup-v2",
    featured: true,
  },
  {
    id: "2",
    title: "Como conectar sua instância",
    description: "Conecte seu WhatsApp via QR Code ou código de pareamento sem riscos.",
    videoUrl: null,
    duration: "3:45",
    category: "Início",
    steps: ["Adicionar instância", "Escolher método", "Conectar"],
    featurePath: "/dashboard/warmup-v2",
  },
  {
    id: "3",
    title: "Criando sua primeira campanha",
    description: "Passo a passo para criar e disparar sua primeira campanha de mensagens.",
    videoUrl: null,
    duration: "5:20",
    category: "Campanhas",
    steps: ["Importar contatos", "Criar mensagem", "Disparar"],
    featurePath: "/dashboard/campaigns",
  },
  {
    id: "4",
    title: "Disparo em Grupo",
    description: "Envie mensagens e carrosséis para grupos do WhatsApp em escala.",
    videoUrl: null,
    duration: "6:30",
    category: "Campanhas",
    steps: ["Selecionar grupos", "Montar carrossel", "Enviar"],
    featurePath: "/dashboard/group-carousel-dispatch",
  },
  {
    id: "5",
    title: "Configurando Templates",
    description: "Crie templates reutilizáveis para acelerar suas campanhas.",
    videoUrl: null,
    duration: "4:00",
    category: "Campanhas",
    steps: ["Novo template", "Variáveis", "Salvar"],
    featurePath: "/dashboard/templates",
  },
  {
    id: "6",
    title: "Como usar o Aquecimento",
    description: "Configure o aquecimento de chips corretamente e evite bloqueios.",
    videoUrl: null,
    duration: "4:10",
    category: "Aquecimento",
    steps: ["Selecionar chips", "Definir ciclo", "Ativar"],
    featurePath: "/dashboard/warmup-v2",
  },
  {
    id: "7",
    title: "Conversa entre Chips",
    description: "Mantenha seus chips ativos com conversas automatizadas entre eles.",
    videoUrl: null,
    duration: "3:55",
    category: "Aquecimento",
    steps: ["Pareamento", "Configurar mensagens", "Iniciar"],
    featurePath: "/dashboard/chip-conversation",
  },
  {
    id: "8",
    title: "Resposta Automática com IA",
    description: "Configure fluxos de auto-reply inteligentes para atender 24/7.",
    videoUrl: null,
    duration: "7:20",
    category: "Automação",
    steps: ["Criar fluxo", "Adicionar nós", "Ativar dispositivo"],
    featurePath: "/dashboard/autoreply",
  },
  {
    id: "9",
    title: "Mensagem de Boas-Vindas",
    description: "Receba novos contatos automaticamente com mensagens personalizadas.",
    videoUrl: null,
    duration: "3:30",
    category: "Automação",
    steps: ["Editar mensagem", "Selecionar gatilho", "Ativar"],
    featurePath: "/dashboard/welcome-automation",
  },
];

const CATEGORY_ORDER = ["Início", "Campanhas", "Aquecimento", "Automação"] as const;

const CATEGORY_META: Record<string, { icon: typeof Rocket; color: string }> = {
  "Início": { icon: Rocket, color: "text-sky-400" },
  "Campanhas": { icon: Send, color: "text-violet-400" },
  "Aquecimento": { icon: Flame, color: "text-orange-400" },
  "Automação": { icon: Zap, color: "text-emerald-400" },
};

function getWatched(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export default function TutorialsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [watched, setWatched] = useState<Set<string>>(getWatched);

  const markWatched = (id: string) => {
    const next = new Set(watched);
    next.add(id);
    setWatched(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  };

  const handleWatch = (t: Tutorial) => {
    if (!t.videoUrl) return;
    markWatched(t.id);
    window.open(t.videoUrl, "_blank");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tutorials;
    return tutorials.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    );
  }, [search]);

  const featured = tutorials.find((t) => t.featured);
  const totalWatched = watched.size;
  const progress = Math.round((totalWatched / tutorials.length) * 100);

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-10">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <PlayCircle className="w-5 h-5 text-primary" />
              </span>
              Central de Aprendizado
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">Vídeos curtos e diretos para dominar cada função da plataforma.</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Progresso</span>
              <div className="w-28 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="font-semibold text-foreground tabular-nums">{totalWatched}/{tutorials.length}</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="O que você quer aprender?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-card border-border/60"
          />
        </div>
      </div>

      {/* Featured "Comece por aqui" */}
      {featured && !search && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">Comece por aqui</h2>
          </div>
          <Card className="overflow-hidden bg-gradient-to-br from-primary/[0.08] via-card to-card border-primary/20 hover:border-primary/40 transition-all">
            <div className="grid md:grid-cols-2 gap-0">
              {/* Thumbnail */}
              <div
                className={`relative aspect-video md:aspect-auto md:min-h-[280px] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center group overflow-hidden ${featured.videoUrl ? "cursor-pointer" : "cursor-default"}`}
                onClick={() => handleWatch(featured)}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_hsl(var(--primary)/0.15),_transparent_70%)]" />
                {featured.videoUrl ? (
                  <>
                    <div className="relative w-20 h-20 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-primary/30 group-hover:scale-110 transition-transform">
                      <PlayCircle className="w-10 h-10 text-primary" />
                    </div>
                    <Badge className="absolute top-3 right-3 bg-background/80 backdrop-blur text-foreground border-border/50 gap-1">
                      <Clock className="w-3 h-3" /> {featured.duration}
                    </Badge>
                  </>
                ) : (
                  <div className="relative flex flex-col items-center gap-2 text-muted-foreground/60">
                    <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center ring-1 ring-border/40">
                      <Hourglass className="w-7 h-7" />
                    </div>
                    <span className="text-xs font-medium">Aula em breve</span>
                  </div>
                )}
              </div>
              {/* Content */}
              <CardContent className="p-6 flex flex-col justify-center space-y-4">
                <div>
                  <Badge variant="outline" className="mb-3 border-primary/30 text-primary bg-primary/5">Destaque</Badge>
                  <h3 className="text-xl font-bold text-foreground">{featured.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{featured.description}</p>
                </div>
                {featured.steps && (
                  <ul className="space-y-1.5">
                    {featured.steps.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={() => handleWatch(featured)} disabled={!featured.videoUrl} className="gap-1.5">
                    {featured.videoUrl ? <><PlayCircle className="w-4 h-4" /> Começar agora</> : <><Hourglass className="w-4 h-4" /> Em breve</>}
                  </Button>
                  {featured.featurePath && (
                    <Button variant="outline" onClick={() => navigate(featured.featurePath!)} className="gap-1.5">
                      Ir para função <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </div>
          </Card>
        </section>
      )}

      {/* Categories */}
      {CATEGORY_ORDER.map((category) => {
        const items = filtered.filter((t) => t.category === category && !t.featured);
        if (items.length === 0) return null;
        const meta = CATEGORY_META[category];
        const Icon = meta?.icon || PlayCircle;
        return (
          <section key={category} className="space-y-4">
            <div className="flex items-center gap-2.5 pb-1 border-b border-border/40">
              <Icon className={`w-4 h-4 ${meta?.color || "text-primary"}`} />
              <h2 className="text-sm font-bold text-foreground tracking-tight">{category}</h2>
              <span className="text-xs text-muted-foreground">· {items.length} {items.length === 1 ? "vídeo" : "vídeos"}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((t) => {
                const isWatched = watched.has(t.id);
                return (
                  <Card key={t.id} className="group bg-card border-border/60 hover:border-primary/30 transition-all overflow-hidden flex flex-col">
                    {/* Thumb */}
                    <div
                      className={`relative aspect-video bg-gradient-to-br from-muted to-muted/40 flex items-center justify-center overflow-hidden ${t.videoUrl ? "cursor-pointer" : "cursor-default"}`}
                      onClick={() => handleWatch(t)}
                    >
                      {t.videoUrl ? (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                          <PlayCircle className="relative w-12 h-12 text-white/90 group-hover:scale-110 group-hover:text-primary transition-all" />
                          <Badge className="absolute top-2 right-2 bg-black/60 text-white text-[10px] border-0 gap-1 backdrop-blur">
                            <Clock className="w-2.5 h-2.5" /> {t.duration}
                          </Badge>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-muted-foreground/55">
                          <Hourglass className="w-8 h-8" />
                          <span className="text-[11px] font-medium">Aula em breve</span>
                        </div>
                      )}
                      {isWatched && t.videoUrl && (
                        <Badge className="absolute top-2 left-2 bg-emerald-500/90 text-white text-[10px] border-0 gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Visto
                        </Badge>
                      )}
                    </div>
                    {/* Content */}
                    <CardContent className="p-4 flex flex-col flex-1 gap-3">
                      <div className="space-y-1.5">
                        <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{t.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{t.description}</p>
                      </div>
                      {t.steps && (
                        <ul className="space-y-1 pt-1 border-t border-border/30">
                          {t.steps.map((s, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              {isWatched && t.videoUrl ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              ) : (
                                <Circle className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                              )}
                              {s}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex gap-2 mt-auto pt-2">
                        <Button size="sm" onClick={() => handleWatch(t)} disabled={!t.videoUrl} className="flex-1 h-8 text-xs gap-1">
                          {t.videoUrl ? <><PlayCircle className="w-3.5 h-3.5" /> Assistir</> : <><Hourglass className="w-3.5 h-3.5" /> Em breve</>}
                        </Button>
                        {t.featurePath && (
                          <Button size="sm" variant="outline" onClick={() => navigate(t.featurePath!)} className="h-8 text-xs gap-1 px-2.5" title="Ir para essa função">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <Search className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum tutorial encontrado para "{search}".</p>
        </div>
      )}
    </div>
  );
}
