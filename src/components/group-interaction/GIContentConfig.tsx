import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { FileText, Image, Mic, Sticker, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ContentTypes {
  text: boolean;
  image: boolean;
  audio: boolean;
  sticker: boolean;
}

interface Props {
  contentTypes: ContentTypes;
  onChange: (types: ContentTypes) => void;
}

const TYPES: { key: keyof ContentTypes; label: string; icon: LucideIcon }[] = [
  { key: "text", label: "Texto", icon: FileText },
  { key: "image", label: "Imagem", icon: Image },
  { key: "audio", label: "Áudio", icon: Mic },
  { key: "sticker", label: "Figurinha", icon: Sticker },
];

export default function GIContentConfig({ contentTypes, onChange }: Props) {
  const toggleType = (key: keyof ContentTypes) => {
    const newTypes = { ...contentTypes, [key]: !contentTypes[key] };
    onChange(newTypes);
  };

  const enabledTypes = TYPES.filter((t) => contentTypes[t.key]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Tipos de Conteúdo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {TYPES.map((t) => (
          <div key={t.key} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-2.5">
              <t.icon className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm">{t.label}</Label>
            </div>
            <Switch
              checked={contentTypes[t.key]}
              onCheckedChange={() => toggleType(t.key)}
            />
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
