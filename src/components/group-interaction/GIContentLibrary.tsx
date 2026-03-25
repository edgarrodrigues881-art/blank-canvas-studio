import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Trash2, Star, StarOff, Upload, FileText, Image, Video, File, Sticker,
  type LucideIcon,
} from "lucide-react";
import { useGroupInteractionMedia, type GroupInteractionMedia } from "@/hooks/useGroupInteractionMedia";
import { toast } from "sonner";

const MEDIA_TYPES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "text", label: "Textos", icon: FileText },
  { key: "image", label: "Imagens", icon: Image },
  { key: "video", label: "Vídeos", icon: Video },
  { key: "file", label: "Arquivos", icon: File },
  { key: "sticker", label: "Figurinhas", icon: Sticker },
];

export default function GIContentLibrary({ interactionId }: { interactionId?: string | null }) {
  const { media, addMedia, updateMedia, deleteMedia, uploadFile } = useGroupInteractionMedia(interactionId);
  const [tab, setTab] = useState("text");
  const [newText, setNewText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = media.filter((m) => m.media_type === tab);

  const handleAddText = () => {
    if (!newText.trim()) return;
    addMedia.mutate({
      media_type: "text" as any,
      content: newText.trim(),
      interaction_id: interactionId || undefined,
    });
    setNewText("");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      try {
        const url = await uploadFile(file, tab);
        await addMedia.mutateAsync({
          media_type: tab as any,
          content: file.name,
          file_url: url,
          file_name: file.name,
          interaction_id: interactionId || undefined,
        });
      } catch (err: any) {
        toast.error(`Erro ao enviar ${file.name}: ${err.message}`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleActive = (item: GroupInteractionMedia) => {
    updateMedia.mutate({ id: item.id, is_active: !item.is_active });
  };

  const toggleFavorite = (item: GroupInteractionMedia) => {
    updateMedia.mutate({ id: item.id, is_favorite: !item.is_favorite });
  };

  const acceptMap: Record<string, string> = {
    image: "image/*",
    video: "video/*",
    file: "*/*",
    sticker: "image/webp,image/png",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          Biblioteca de Conteúdos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-5 mb-4">
            {MEDIA_TYPES.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1 text-xs">
                <t.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {MEDIA_TYPES.map((t) => (
            <TabsContent key={t.key} value={t.key} className="space-y-3">
              {/* Add area */}
              {t.key === "text" ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite uma mensagem para a biblioteca..."
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddText()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleAddText} disabled={!newText.trim()}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={acceptMap[t.key]}
                    multiple
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-dashed"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Enviar {t.label.toLowerCase()}
                  </Button>
                </div>
              )}

              {/* Items list */}
              <ScrollArea className="h-[240px]">
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Nenhum conteúdo de {t.label.toLowerCase()} adicionado
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filtered.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                          item.is_active
                            ? "bg-card border-border/50 hover:border-border"
                            : "bg-muted/20 border-border/20 opacity-60"
                        }`}
                      >
                        {/* Preview */}
                        <div className="flex-1 min-w-0">
                          {item.media_type === "text" ? (
                            <p className="text-sm truncate">{item.content}</p>
                          ) : item.media_type === "image" || item.media_type === "sticker" ? (
                            <div className="flex items-center gap-2">
                              {item.file_url && (
                                <img
                                  src={item.file_url}
                                  alt=""
                                  className="w-8 h-8 rounded object-cover"
                                />
                              )}
                              <span className="text-sm truncate">{item.file_name || item.content}</span>
                            </div>
                          ) : (
                            <span className="text-sm truncate">{item.file_name || item.content}</span>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleFavorite(item)}
                            className="p-1 rounded hover:bg-muted/50"
                          >
                            {item.is_favorite ? (
                              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            ) : (
                              <StarOff className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </button>
                          <Switch
                            checked={item.is_active}
                            onCheckedChange={() => toggleActive(item)}
                            className="scale-75"
                          />
                          <button
                            onClick={() => deleteMedia.mutate(item.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{filtered.length} itens · {filtered.filter((m) => m.is_active).length} ativos</span>
                {filtered.filter((m) => m.is_favorite).length > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    <Star className="w-2.5 h-2.5 mr-1 fill-amber-400 text-amber-400" />
                    {filtered.filter((m) => m.is_favorite).length} favoritos
                  </Badge>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
