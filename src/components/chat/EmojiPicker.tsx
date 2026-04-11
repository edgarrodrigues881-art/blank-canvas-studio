import { useState, useRef, useEffect, useCallback } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [pickerLoaded, setPickerLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Dynamically load emoji-mart when first opened
  useEffect(() => {
    if (!open || pickerLoaded) return;
    let cancelled = false;

    Promise.all([
      import("@emoji-mart/data"),
      import("emoji-mart"),
    ]).then(([dataModule, emojiMart]) => {
      if (cancelled || !pickerRef.current) return;
      const picker = new (emojiMart as any).Picker({
        data: dataModule.default,
        onEmojiSelect: (emoji: any) => {
          onEmojiSelect(emoji.native);
        },
        locale: "pt",
        theme: "dark",
        previewPosition: "none",
        skinTonePosition: "search",
        set: "native",
        perLine: 8,
        maxFrequentRows: 2,
      });
      pickerRef.current.innerHTML = "";
      pickerRef.current.appendChild(picker);
      setPickerLoaded(true);
    });

    return () => { cancelled = true; };
  }, [open, pickerLoaded, onEmojiSelect]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="w-9 h-9 shrink-0 text-muted-foreground hover:text-foreground mb-0.5"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Smile className="w-4 h-4" />
      </Button>

      {open && (
        <div className="absolute bottom-12 left-0 z-50 shadow-xl rounded-xl overflow-hidden">
          <div ref={pickerRef} className="[&>em-emoji-picker]{--em-rgb-background:30,30,30}" />
        </div>
      )}
    </div>
  );
}
