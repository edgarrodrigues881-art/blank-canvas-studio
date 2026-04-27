import { useRef, useState } from "react";
import { Upload, X, Image, Mic, Paperclip, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type MediaKind = "image" | "audio" | "file";

interface Props {
  kind: MediaKind;
  url: string;
  fileName?: string;
  onChange: (url: string, fileName?: string) => void;
  onRemove: () => void;
}

const accept: Record<MediaKind, string> = {
  image: "image/jpeg,image/png,image/gif,image/webp",
  audio: "audio/mpeg,audio/ogg,audio/wav,audio/aac,audio/mp4",
  file:  "application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv",
};

const kindMeta: Record<MediaKind, { icon: any; label: string; hint: string }> = {
  image: { icon: Image,      label: "Imagem",   hint: "JPG, PNG, GIF, WEBP — máx 20MB" },
  audio: { icon: Mic,        label: "Áudio",    hint: "MP3, OGG, WAV, AAC — máx 20MB" },
  file:  { icon: Paperclip,  label: "Arquivo",  hint: "PDF, DOC, XLS, TXT — máx 20MB" },
};

async function compressIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (blob) resolve(new File([blob], file.name, { type: "image/jpeg" }));
        else resolve(file);
      }, "image/jpeg", 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function MediaUpload({ kind, url, fileName, onChange, onRemove }: Props) {
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const meta = kindMeta[kind];
  const Icon = meta.icon;

  const handleFile = async (file: File) => {
    if (!session) { toast.error("Não autenticado"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 20MB."); return; }
    setUploading(true);
    try {
      const optimized = await compressIfImage(file);
      const ext = optimized.name.split(".").pop() || "bin";
      const path = `${session.user.id}/flow-media/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, optimized, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      onChange(data.publicUrl, file.name);
      toast.success("Arquivo enviado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (url) {
    return (
      <div className="relative rounded-xl border border-border/40 overflow-hidden bg-muted/20">
        {kind === "image" && (
          <img src={url} alt="" className="w-full h-36 object-cover" />
        )}
        {kind === "audio" && (
          <div className="px-3 py-3">
            <audio controls src={url} className="w-full h-8" />
          </div>
        )}
        {kind === "file" && (
          <div className="flex items-center gap-2 px-3 py-3">
            <Paperclip className="w-4 h-4 text-muted-foreground/60 shrink-0" />
            <span className="text-xs text-muted-foreground/70 truncate">{fileName || "Arquivo"}</span>
          </div>
        )}
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`rounded-xl border-2 border-dashed transition-all duration-150 cursor-pointer p-5 text-center space-y-2
        ${dragging
          ? "border-primary/60 bg-primary/5"
          : "border-border/40 hover:border-border/70 hover:bg-muted/20"
        }
        ${uploading ? "pointer-events-none" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept[kind]}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <div className="flex flex-col items-center gap-2">
        {uploading ? (
          <Loader2 className="w-7 h-7 text-primary/60 animate-spin" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground/50" />
          </div>
        )}
        <div>
          <p className="text-[12px] font-medium text-foreground/70">
            {uploading ? "Enviando..." : `Clique ou arraste ${meta.label.toLowerCase()}`}
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">{meta.hint}</p>
        </div>
      </div>
    </div>
  );
}
