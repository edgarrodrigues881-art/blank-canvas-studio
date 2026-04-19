import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hourglass } from "lucide-react";
import type { TutorialItem } from "@/lib/tutorials";

interface Props {
  tutorial: TutorialItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const toEmbedUrl = (url: string): string => {
  // YouTube
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
};

export const TutorialModal = ({ tutorial, open, onOpenChange }: Props) => {
  if (!tutorial) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden bg-card border-border">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-semibold">{tutorial.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{tutorial.description}</p>
        </DialogHeader>
        <div className="aspect-video bg-muted/40 flex items-center justify-center">
          {open && tutorial.videoUrl ? (
            <iframe
              src={toEmbedUrl(tutorial.videoUrl)}
              title={tutorial.title}
              className="w-full h-full"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
              <Hourglass className="w-8 h-8" />
              <span className="text-sm font-medium">Aula em breve</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
