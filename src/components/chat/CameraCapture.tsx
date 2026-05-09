import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, SwitchCamera, X, RotateCcw, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CameraCaptureProps {
  open: boolean;
  initialFacing?: "user" | "environment";
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function CameraCapture({ open, initialFacing = "environment", onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">(initialFacing);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(async (mode: "user" | "environment") => {
    setLoading(true);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      toast.error("Não foi possível acessar a câmera", {
        description: err?.message || "Verifique as permissões do navegador.",
      });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [onClose, stopStream]);

  useEffect(() => {
    if (open && !preview) {
      setFacing(initialFacing);
      startStream(initialFacing);
    }
    return () => { if (!open) stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !preview) startStream(facing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => () => stopStream(), [stopStream]);

  const handleSwitch = () => setFacing((f) => (f === "user" ? "environment" : "user"));

  const handleShoot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPreviewBlob(blob);
      setPreview(URL.createObjectURL(blob));
      stopStream();
    }, "image/jpeg", 0.92);
  };

  const handleRetake = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPreviewBlob(null);
    startStream(facing);
  };

  const handleConfirm = () => {
    if (!previewBlob) return;
    const file = new File([previewBlob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPreviewBlob(null);
    onClose();
  };

  const handleClose = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPreviewBlob(null);
    stopStream();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <Button variant="ghost" size="icon" onClick={handleClose} className="text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </Button>
        <span className="text-sm font-medium">{preview ? "Pré-visualização" : "Câmera"}</span>
        {!preview ? (
          <Button variant="ghost" size="icon" onClick={handleSwitch} className="text-white hover:bg-white/10" disabled={loading}>
            <SwitchCamera className="w-5 h-5" />
          </Button>
        ) : (
          <span className="w-9" />
        )}
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {loading && !preview && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        )}
        {!preview ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className={`max-h-full max-w-full object-contain ${facing === "user" ? "scale-x-[-1]" : ""}`}
          />
        ) : (
          <img src={preview} alt="Captura" className="max-h-full max-w-full object-contain" />
        )}
      </div>

      <div className="p-6 flex items-center justify-center gap-8">
        {!preview ? (
          <button
            onClick={handleShoot}
            disabled={loading}
            className="w-16 h-16 rounded-full bg-white border-4 border-white/30 active:scale-95 transition-transform disabled:opacity-50"
            aria-label="Tirar foto"
          >
            <Camera className="w-6 h-6 mx-auto text-black" />
          </button>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={handleRetake} className="rounded-full gap-2">
              <RotateCcw className="w-4 h-4" /> Refazer
            </Button>
            <Button size="lg" onClick={handleConfirm} className="rounded-full gap-2">
              <Check className="w-4 h-4" /> Usar foto
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
