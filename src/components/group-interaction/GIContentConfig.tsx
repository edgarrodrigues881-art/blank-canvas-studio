import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { FileText, Image, Video, File, Sticker, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ContentTypes {
  text: boolean;
  image: boolean;
  video: boolean;
  file: boolean;
  sticker: boolean;
}

interface ContentWeights {
  text: number;
  image: number;
  video: number;
  file: number;
  sticker: number;
}

interface Props {
  contentTypes: ContentTypes;
  contentWeights: ContentWeights;
  onChange: (types: ContentTypes, weights: ContentWeights) => void;
}

const TYPES: { key: keyof ContentTypes; label: string; icon: LucideIcon }[] = [
  { key: "text", label: "Texto", icon: FileText },
  { key: "image", label: "Imagem", icon: Image },
  { key: "video", label: "Vídeo", icon: Video },
  { key: "file", label: "Arquivo", icon: File },
  { key: "sticker", label: "Figurinha", icon: Sticker },
];

export default function GIContentConfig({ contentTypes, contentWeights, onChange }: Props) {
  const toggleType = (key: keyof ContentTypes) => {
    const newTypes = { ...contentTypes, [key]: !contentTypes[key] };
    onChange(newTypes, contentWeights);
  };

  const setWeight = (key: keyof ContentWeights, value: number) => {
    const newWeights = { ...contentWeights, [key]: value };
    onChange(contentTypes, newWeights);
  };

  const enabledTypes = TYPES.filter((t) => contentTypes[t.key]);
  const totalWeight = enabledTypes.reduce((sum, t) => sum + (contentWeights[t.key] || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Tipos de Conteúdo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {TYPES.map((t) => (
          <div key={t.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <t.icon className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm">{t.label}</Label>
              </div>
              <Switch
                checked={contentTypes[t.key]}
                onCheckedChange={() => toggleType(t.key)}
              />
            </div>
            {contentTypes[t.key] && (
              <div className="flex items-center gap-3 pl-6">
                <Slider
                  value={[contentWeights[t.key] || 0]}
                  onValueChange={([v]) => setWeight(t.key, v)}
                  min={5}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-10 text-right text-muted-foreground">
                  {totalWeight > 0
                    ? Math.round(((contentWeights[t.key] || 0) / totalWeight) * 100)
                    : 0}%
                </span>
              </div>
            )}
          </div>
        ))}

        {enabledTypes.length === 0 && (
          <p className="text-xs text-amber-400 text-center py-2">
            Ative pelo menos um tipo de conteúdo
          </p>
        )}
      </CardContent>
    </Card>
  );
}
