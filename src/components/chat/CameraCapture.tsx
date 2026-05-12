import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, SwitchCamera, X, RotateCcw, Check, Loader2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CameraCaptureProps {
  open: boolean;
  initialFacing?: "user" | "environment";
  onClose: () => void;
  onCapture: (file: File) => void;
}

// Try, in order: exact requested facing → ideal facing → enumerate and pick by label → any camera
async function openCameraStream(mode: "user" | "environment"): Promise<MediaStream> {
  const get = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);
  // 1) exact (forces back cam on phones with multiple lenses)
  try {
    return await get({
      video: {
        facingMode: { exact: mode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch { /* fall through */ }
  // 2) ideal
  try {
    return await get({
      video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch { /* fall through */ }
  // 3) enumerate and try by label keyword
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    const wantBack = mode === "environment";
    const match = cams.find((d) => {
      const l = (d.label || "").toLowerCase();
      return wantBack
        ? /(back|rear|environment|traseir|atrás|principal)/.test(l)
        : /(front|user|frontal|self)/.test(l);
    });
    if (match) {
      return await get({ video: { deviceId: { exact: match.deviceId } }, audio: false });
    }
  } catch { /* fall through */ }
  // 4) anything
  return await get({ video: true, audio: false });
}

export function CameraCapture({ open, initialFacing = "environment", onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">(initialFacing);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [shooting, setShooting] = useState(false);

  // Zoom
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  // Tap-to-focus indicator
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    }
    setReady(false);
    setZoomCaps(null);
    setZoom(1);
  }, []);

  const startStream = useCallback(async (mode: "user" | "environment") => {
    setLoading(true);
    setReady(false);
    stopStream();
    try {
      const stream = await openCameraStream(mode);
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] || null;
      trackRef.current = track;

      // Detect zoom capability
      try {
        const caps: any = track?.getCapabilities?.() || {};
        if (caps.zoom && typeof caps.zoom.min === "number" && typeof caps.zoom.max === "number" && caps.zoom.max > caps.zoom.min) {
          setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
          setZoom(caps.zoom.min);
        }
      } catch { /* ignore */ }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        const v = videoRef.current;
        const onReady = () => {
          setReady(true);
          setLoading(false);
          v.removeEventListener("loadedmetadata", onReady);
          v.removeEventListener("loadeddata", onReady);
        };
        v.addEventListener("loadedmetadata", onReady);
        v.addEventListener("loadeddata", onReady);
        await v.play().catch(() => {});
        // Safety: if events don't fire fast enough but width is available
        setTimeout(() => {
          if (v.videoWidth > 0) onReady();
        }, 600);
      }
    } catch (err: any) {
      const name = err?.name || "";
      const desc =
        name === "NotAllowedError"
          ? "Permissão negada. Habilite a câmera nas configurações do navegador."
          : name === "NotFoundError"
          ? "Nenhuma câmera encontrada neste dispositivo."
          : err?.message || "Verifique as permissões do navegador.";
      toast.error("Não foi possível acessar a câmera", { description: desc });
      setLoading(false);
      onClose();
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

  // Apply zoom changes
  useEffect(() => {
    const track: any = trackRef.current;
    if (!track || !zoomCaps) return;
    track.applyConstraints({ advanced: [{ zoom }] }).catch(() => {});
  }, [zoom, zoomCaps]);

  const handleSwitch = () => setFacing((f) => (f === "user" ? "environment" : "user"));

  // Tap-to-focus (uses pointsOfInterest where supported, e.g. Chrome Android)
  const handleTapFocus = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = v.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    const x = (point.clientX - rect.left) / rect.width;
    const y = (point.clientY - rect.top) / rect.height;
    setFocusPoint({ x: point.clientX - rect.left, y: point.clientY - rect.top });
    setTimeout(() => setFocusPoint(null), 800);
    const track: any = trackRef.current;
    if (!track) return;
    try {
      const caps: any = track.getCapabilities?.() || {};
      const advanced: any[] = [];
      if (caps.focusMode && caps.focusMode.includes("single-shot")) {
        advanced.push({ focusMode: "single-shot" });
      } else if (caps.focusMode && caps.focusMode.includes("continuous")) {
        advanced.push({ focusMode: "continuous" });
      }
      if (caps.pointsOfInterest) {
        advanced.push({ pointsOfInterest: [{ x, y }] });
      }
      if (advanced.length) await track.applyConstraints({ advanced });
    } catch { /* ignore */ }
  }, []);

  const handleShoot = useCallback(async () => {
    if (shooting) return;
    const video = videoRef.current;
    if (!video) return;

    // Wait briefly for the frame to be ready (covers "click did nothing" cases)
    if (!video.videoWidth || video.readyState < 2) {
      for (let i = 0; i < 20 && (!video.videoWidth || video.readyState < 2); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!video.videoWidth) {
        toast.error("Câmera ainda não está pronta. Tente novamente.");
        return;
      }
    }

    setShooting(true);
    // Show preview immediately from current frame so user perceives instant capture
    try {
      const MAX = 1280;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(1, MAX / Math.max(vw, vh));
      const cw = Math.round(vw * scale);
      const ch = Math.round(vh * scale);

      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setShooting(false); return; }

      if (facing === "user") {
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, cw, ch);

      // Stop stream right away to free the camera (frame already drawn)
      stopStream();

      // Show preview from canvas synchronously via dataURL-like quick path
      const quickUrl = canvas.toDataURL("image/jpeg", 0.7);
      setPreview(quickUrl);
      setShooting(false);

      // Encode the high-quality blob in the background for upload
      canvas.toBlob((b) => {
        if (b) setPreviewBlob(b);
      }, "image/jpeg", 0.8);
    } catch {
      setShooting(false);
    }
  }, [facing, shooting, stopStream]);

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

  // Pinch-to-zoom
  const pinchRef = useRef<{ dist: number; startZoom: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && zoomCaps) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), startZoom: zoom };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current && zoomCaps) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx, dy);
      const ratio = d / pinchRef.current.dist;
      const range = zoomCaps.max - zoomCaps.min;
      const next = Math.min(zoomCaps.max, Math.max(zoomCaps.min, pinchRef.current.startZoom + (ratio - 1) * range));
      setZoom(next);
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
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

      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden"
        onClick={!preview && ready ? handleTapFocus : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
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
            autoPlay
            className={`max-h-full max-w-full object-contain ${facing === "user" ? "scale-x-[-1]" : ""}`}
          />
        ) : (
          <img src={preview} alt="Captura" className="max-h-full max-w-full object-contain" />
        )}

        {/* Tap-to-focus reticle */}
        {focusPoint && (
          <div
            className="pointer-events-none absolute w-16 h-16 border-2 border-white/90 rounded-full animate-ping"
            style={{ left: focusPoint.x - 32, top: focusPoint.y - 32 }}
          />
        )}

        {/* Zoom slider (right edge) */}
        {!preview && zoomCaps && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-2 py-3">
            <ZoomIn className="w-4 h-4 text-white" />
            <input
              type="range"
              min={zoomCaps.min}
              max={zoomCaps.max}
              step={zoomCaps.step}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="h-32"
              style={{ writingMode: "vertical-lr" as any, WebkitAppearance: "slider-vertical" as any, width: 24 }}
              aria-label="Zoom"
            />
            <span className="text-[10px] text-white/80 tabular-nums">{zoom.toFixed(1)}x</span>
          </div>
        )}
      </div>

      <div className="p-6 flex items-center justify-center gap-8">
        {!preview ? (
          <button
            onClick={handleShoot}
            disabled={loading || !ready || shooting}
            className="w-16 h-16 rounded-full bg-white border-4 border-white/30 active:scale-95 transition-transform disabled:opacity-50"
            aria-label="Tirar foto"
          >
            {shooting ? (
              <Loader2 className="w-6 h-6 mx-auto text-black animate-spin" />
            ) : (
              <Camera className="w-6 h-6 mx-auto text-black" />
            )}
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
