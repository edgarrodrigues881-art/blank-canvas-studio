import { PlayCircle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Tutorial {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: string;
  category: string;
}

const tutorials: Tutorial[] = [
  {
    id: "1",
    title: "Como conectar sua instância",
    description: "Aprenda a conectar seu WhatsApp na plataforma via QR Code ou código de pareamento.",
    videoUrl: "https://www.youtube.com/watch?v=example1",
    duration: "3:45",
    category: "Início",
  },
  {
    id: "2",
    title: "Criando sua primeira campanha",
    description: "Passo a passo para criar e enviar sua primeira campanha de mensagens.",
    videoUrl: "https://www.youtube.com/watch?v=example2",
    duration: "5:20",
    category: "Campanhas",
  },
  {
    id: "3",
    title: "Como usar o Aquecimento",
    description: "Entenda como funciona o aquecimento de chips e como configurar corretamente.",
    videoUrl: "https://www.youtube.com/watch?v=example3",
    duration: "4:10",
    category: "Aquecimento",
  },
  {
    id: "4",
    title: "Disparo em Grupo",
    description: "Aprenda a enviar mensagens e carrosséis para grupos do WhatsApp.",
    videoUrl: "https://www.youtube.com/watch?v=example4",
    duration: "6:30",
    category: "Campanhas",
  },
  {
    id: "5",
    title: "Extrator de Grupos e Links",
    description: "Como extrair links de convite e leads de grupos do WhatsApp.",
    videoUrl: "https://www.youtube.com/watch?v=example5",
    duration: "3:55",
    category: "Ferramentas",
  },
  {
    id: "6",
    title: "Configurando Templates",
    description: "Crie e gerencie templates de mensagem para reutilizar em suas campanhas.",
    videoUrl: "https://www.youtube.com/watch?v=example6",
    duration: "4:00",
    category: "Campanhas",
  },
];

const categories = [...new Set(tutorials.map((t) => t.category))];

export default function TutorialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <PlayCircle className="w-6 h-6 text-primary" />
          Tutoriais
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vídeos explicativos de como usar cada função da plataforma.
        </p>
      </div>

      {categories.map((category) => (
        <div key={category} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tutorials
              .filter((t) => t.category === category)
              .map((tutorial) => (
                <Card
                  key={tutorial.id}
                  className="group bg-card border-border hover:border-primary/30 transition-colors cursor-pointer overflow-hidden"
                  onClick={() => window.open(tutorial.videoUrl, "_blank")}
                >
                  {/* Video thumbnail placeholder */}
                  <div className="relative w-full aspect-video bg-muted/50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <PlayCircle className="w-12 h-12 text-white/80 group-hover:text-primary group-hover:scale-110 transition-all duration-200 z-10" />
                    <Badge className="absolute top-2 right-2 bg-black/60 text-white text-[10px] border-0">
                      {tutorial.duration}
                    </Badge>
                  </div>
                  <CardContent className="p-4 space-y-1.5">
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {tutorial.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {tutorial.description}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-primary/70 pt-1">
                      <ExternalLink className="w-3 h-3" />
                      Assistir vídeo
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      ))}

      {tutorials.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <PlayCircle className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhum tutorial disponível ainda.</p>
        </div>
      )}
    </div>
  );
}
