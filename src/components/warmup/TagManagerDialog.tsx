import { useState, useEffect, KeyboardEvent, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { X, Plus, Tag, Sparkles, Palette, Pipette } from "lucide-react";

const PRESET_COLORS = [
  // Row 1 — vivid
  "#10b981", "#34d399", "#06b6d4", "#22d3ee", "#3b82f6", "#60a5fa",
  "#8b5cf6", "#a78bfa", "#ec4899", "#f472b6", "#ef4444", "#f87171",
  // Row 2 — warm & earth
  "#f59e0b", "#fbbf24", "#f97316", "#fb923c", "#84cc16", "#a3e635",
  "#14b8a6", "#2dd4bf", "#6366f1", "#818cf8", "#d946ef", "#e879f9",
];

export interface FolderTag {
  label: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: FolderTag[];
  onSave: (tags: FolderTag[]) => Promise<void>;
  folderName: string;
  folderColor: string;
}

export function TagManagerDialog({ open, onOpenChange, tags: initialTags, onSave, folderName, folderColor }: Props) {
  const [tags, setTags] = useState<FolderTag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [showCustomColor, setShowCustomColor] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTags([...initialTags]);
      setTagInput("");
      setTagColor(PRESET_COLORS[0]);
      setShowCustomColor(false);
    }
  }, [open, initialTags]);

  const addTag = () => {
    const label = tagInput.trim();
    if (!label || tags.some(t => t.label.toLowerCase() === label.toLowerCase())) return;
    setTags(prev => [...prev, { label, color: tagColor }]);
    setTagInput("");
    const idx = PRESET_COLORS.indexOf(tagColor);
    if (idx >= 0) setTagColor(PRESET_COLORS[(idx + 1) % PRESET_COLORS.length]);
  };

  const removeTag = (label: string) => {
    setTags(prev => prev.filter(t => t.label !== label));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addTag(); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(tags);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-background/95 backdrop-blur-3xl border-border/10 p-0 overflow-hidden rounded-3xl shadow-[0_32px_80px_-12px_rgba(0,0,0,0.7)]">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none" />
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-3 relative">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: `${folderColor}25`, boxShadow: `0 8px 24px -4px ${folderColor}30` }}
              >
                <Tag className="w-5 h-5" style={{ color: folderColor }} />
              </div>
              <div>
                <span className="text-foreground">Tags</span>
                <span className="text-muted-foreground/50 font-medium ml-2 text-sm">— {folderName}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 pb-3 space-y-5">
          {/* Tags display */}
          <div className="min-h-[56px] rounded-2xl border-2 border-border/10 bg-card/20 p-3.5">
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag.label}
                    className="group inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl text-[11px] font-bold text-white shadow-md transition-all hover:shadow-lg hover:scale-[1.03]"
                    style={{ backgroundColor: tag.color, boxShadow: `0 4px 12px -2px ${tag.color}50` }}
                  >
                    {tag.label}
                    <button
                      onClick={() => removeTag(tag.label)}
                      className="opacity-60 group-hover:opacity-100 hover:bg-white/25 rounded-lg p-0.5 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 gap-2">
                <Sparkles className="w-6 h-6 text-muted-foreground/15" />
                <p className="text-[11px] text-muted-foreground/35 font-medium">Nenhuma tag criada ainda</p>
              </div>
            )}
          </div>

          {/* Add tag section */}
          <div className="space-y-4">
            <label className="text-[10px] font-extrabold text-foreground uppercase tracking-[0.18em]">Nova tag</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-sm pointer-events-none"
                  style={{ backgroundColor: tagColor, boxShadow: `0 0 8px ${tagColor}60` }}
                />
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite o nome..."
                  className="h-11 pl-10 text-xs bg-card/50 border-2 border-border/20 focus-visible:border-primary/40 rounded-xl font-medium"
                  autoFocus
                />
              </div>
              <Button
                size="sm"
                onClick={addTag}
                disabled={!tagInput.trim()}
                className="h-11 w-11 rounded-xl shrink-0 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Color picker */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-extrabold text-foreground uppercase tracking-[0.18em]">Cor da tag</label>
                <button
                  onClick={() => {
                    setShowCustomColor(!showCustomColor);
                    if (!showCustomColor) setTimeout(() => colorInputRef.current?.click(), 100);
                  }}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  <Pipette className="w-3 h-3" />
                  {showCustomColor ? "Fechar" : "Cor personalizada"}
                </button>
              </div>
              <div className="grid grid-cols-12 gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTagColor(c)}
                    className={cn(
                      "w-full aspect-square rounded-full transition-all duration-200",
                      tagColor === c
                        ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/60 scale-110"
                        : "opacity-50 hover:opacity-90 hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {showCustomColor && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-card/30 border-2 border-border/10">
                  <Palette className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={tagColor}
                    onChange={(e) => setTagColor(e.target.value)}
                    className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent"
                  />
                  <Input
                    value={tagColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setTagColor(v);
                    }}
                    className="h-8 text-xs font-mono bg-transparent border-border/15 rounded-lg flex-1 uppercase"
                    maxLength={7}
                  />
                  <div
                    className="w-8 h-8 rounded-lg shrink-0 shadow-inner"
                    style={{ backgroundColor: tagColor }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-border/10">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="flex-1 h-11 rounded-xl text-xs font-bold border-border/20">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-11 rounded-xl text-xs font-black shadow-lg shadow-primary/20"
          >
            {saving ? "Salvando..." : "Salvar tags"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
