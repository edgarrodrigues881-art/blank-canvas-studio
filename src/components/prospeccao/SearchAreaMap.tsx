import { useEffect, useState, useCallback, useRef, Suspense, lazy } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  MapPin, Target, CheckCircle2, Navigation, Minus, Plus,
  Loader2, Globe as GlobeIcon, Map as MapIcon,
} from "lucide-react";
import { getCountryNameByCode } from "@/lib/regionNames";

const GlobeScene = lazy(() => import("./GlobeScene"));
const LeafletMap = lazy(() => import("./LeafletMap"));

type ViewMode = "globe" | "map";

interface SearchAreaMapProps {
  cidade: string;
  estado?: string;
  pais?: string;
  onAreaConfirm?: (lat: number, lng: number, radiusKm: number) => void;
  onAreaChange?: (lat: number, lng: number, radiusKm: number) => void;
  onCityDetected?: (city: string) => void;
  initialRadiusKm?: number;
}

export default function SearchAreaMap({
  cidade,
  estado,
  pais = "BR",
  onAreaConfirm,
  onAreaChange,
  onCityDetected,
  initialRadiusKm = 12,
}: SearchAreaMapProps) {
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [changed, setChanged] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("globe");
  const [transitioning, setTransitioning] = useState(false);
  const [renderMode, setRenderMode] = useState<ViewMode>("globe");
  const transitionTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Smooth transition between modes
  const switchMode = useCallback((next: ViewMode) => {
    if (next === viewMode || transitioning) return;
    setTransitioning(true);
    // Start fade out
    setTimeout(() => {
      setRenderMode(next); // swap the rendered component
      setViewMode(next);
      // Fade in after mount
      setTimeout(() => setTransitioning(false), 80);
    }, 300); // fade-out duration
  }, [viewMode, transitioning]);

  // Auto-switch to map when center is set (user picked a city)
  // User can manually toggle back
  useEffect(() => {
    if (center && viewMode === "globe") {
      // Give globe time to animate to location, then offer map
      transitionTimeout.current = setTimeout(() => {
        // Don't auto-switch, let user decide
      }, 2000);
    }
    return () => clearTimeout(transitionTimeout.current);
  }, [center]);

  // Reverse geocode
  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
          { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
        );
        const data = await res.json();
        const addr = data.address || {};
        const cityName =
          addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
        if (cityName) {
          setLocationLabel(cityName);
          onCityDetected?.(cityName);
        }
      } catch { /* ignore */ }
    },
    [onCityDetected]
  );

  // Reset on city clear
  useEffect(() => {
    if (cidade) return;
    setCenter(null);
    setLocationLabel("");
    setConfirmed(false);
    setChanged(false);
    if (viewMode !== "globe") switchMode("globe");
  }, [cidade]);

  // Geocode city
  useEffect(() => {
    if (!cidade) return;
    let cancelled = false;
    const geocode = async () => {
      setGeocoding(true);
      try {
        const parts = [cidade];
        if (estado) parts.push(estado);
        const countryName = getCountryNameByCode(pais);
        if (countryName) parts.push(countryName);
        const q = encodeURIComponent(parts.join(", "));
        const cc = pais.toLowerCase();
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=${cc}`,
          { headers: { "User-Agent": "ProspeccaoBot/1.0" } }
        );
        const data = await res.json();
        if (!cancelled && data.length > 0) {
          const newCenter = {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          };
          setCenter((cur) => {
            if (cur && Math.abs(cur.lat - newCenter.lat) < 0.0001 && Math.abs(cur.lng - newCenter.lng) < 0.0001) return cur;
            return newCenter;
          });
          setLocationLabel(cidade);
          setConfirmed(false);
          setChanged(false);
        }
      } catch {
        console.error("Geocoding failed");
      } finally {
        if (!cancelled) setGeocoding(false);
      }
    };
    geocode();
    return () => { cancelled = true; };
  }, [cidade, estado, pais]);

  useEffect(() => { setRadiusKm(initialRadiusKm); }, [initialRadiusKm]);

  useEffect(() => {
    if (center && onAreaChange) onAreaChange(center.lat, center.lng, radiusKm);
  }, [center, radiusKm, onAreaChange]);

  const handleGlobeClick = useCallback(
    (lat: number, lng: number) => {
      if (!cidade) return;
      setCenter({ lat, lng });
      setConfirmed(false);
      setChanged(true);
      reverseGeocode(lat, lng);
    },
    [cidade, reverseGeocode]
  );

  const handleMapMarkerMove = useCallback(
    (lat: number, lng: number) => {
      setCenter({ lat, lng });
      setConfirmed(false);
      setChanged(true);
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  const handleConfirm = () => {
    if (center && onAreaConfirm) onAreaConfirm(center.lat, center.lng, radiusKm);
    setConfirmed(true);
    setChanged(false);
  };

  /* ── Empty state ── */
  if (!cidade) {
    return (
      <div className="w-full aspect-[4/3] max-h-[420px] rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
          <MapPin className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground/60 text-sm text-center px-4">
          Preencha a cidade para visualizar o mapa
        </p>
      </div>
    );
  }

  if (geocoding) {
    return (
      <div className="w-full aspect-[4/3] max-h-[420px] rounded-xl border border-border bg-muted/10 flex flex-col items-center justify-center gap-3">
        <Target className="h-8 w-8 text-primary animate-pulse" />
        <p className="text-muted-foreground text-sm">Localizando {cidade}...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          className="w-full aspect-[4/3] max-h-[420px] rounded-xl overflow-hidden border border-border"
          style={{
            opacity: transitioning ? 0 : 1,
            transition: "opacity 300ms ease-in-out",
          }}
        >
          <Suspense
            fallback={
              <div className="w-full h-full bg-[#070b14] flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            }
          >
            {renderMode === "globe" ? (
              <GlobeScene
                center={center}
                radiusKm={radiusKm}
                onGlobeClick={handleGlobeClick}
              />
            ) : center ? (
              <LeafletMap
                center={center}
                radiusKm={radiusKm}
                onMarkerMove={handleMapMarkerMove}
              />
            ) : null}
          </Suspense>
        </div>

        {/* Mode toggle pill */}
        <div className="absolute top-3 right-3 z-20">
          <div className="bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 p-0.5 flex gap-0.5">
            <button
              type="button"
              onClick={() => switchMode("globe")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 ${
                viewMode === "globe"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GlobeIcon className="h-3 w-3" />
              Globo
            </button>
            <button
              type="button"
              onClick={() => center && switchMode("map")}
              disabled={!center}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 ${
                viewMode === "map"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-40"
              }`}
            >
              <MapIcon className="h-3 w-3" />
              Mapa
            </button>
          </div>
        </div>

        {/* Location label */}
        {center && (
          <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50 space-y-0.5 max-w-[220px] pointer-events-none z-10">
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3 w-3 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">
                {locationLabel || cidade}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {center.lat.toFixed(4)}, {center.lng.toFixed(4)} · {radiusKm}km
            </p>
          </div>
        )}

        {/* Bottom hints */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 z-10">
          <div className="bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border/50 text-[11px] text-muted-foreground">
            {viewMode === "globe" ? "Clique no globo para ajustar" : "Arraste o marcador para ajustar"}
          </div>
          {confirmed && !changed && (
            <div className="bg-primary/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-primary/30 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium text-primary">Área confirmada</span>
            </div>
          )}
          {changed && !confirmed && (
            <div className="bg-yellow-500/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-yellow-500/30">
              <span className="text-[11px] text-yellow-600 dark:text-yellow-400">Área alterada</span>
            </div>
          )}
        </div>
      </div>

      {/* Radius controls */}
      <div className="flex items-center gap-3 px-1">
        <Label className="text-sm whitespace-nowrap font-medium">Raio:</Label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRadiusKm((r) => Math.max(2, r - 1))}
            className="h-8 w-8 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center hover:bg-muted/60 transition-colors"
          >
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <Input
            type="number"
            min={2}
            max={50}
            value={radiusKm}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 2 && v <= 50) setRadiusKm(v);
            }}
            className="w-16 h-8 text-center text-sm font-medium tabular-nums rounded-lg bg-muted/30 border-border/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => setRadiusKm((r) => Math.min(50, r + 1))}
            className="h-8 w-8 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center hover:bg-muted/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <span className="text-xs text-muted-foreground ml-0.5">km</span>
        </div>
      </div>

      {center && (
        <div className="flex items-center gap-3 px-1">
          <Button
            size="sm"
            variant={confirmed && !changed ? "outline" : "default"}
            onClick={handleConfirm}
            className="gap-2"
          >
            {confirmed && !changed ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Área confirmada
              </>
            ) : (
              <>
                <Target className="h-4 w-4" />
                Usar esta área
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Essa área será usada na prospecção
          </span>
        </div>
      )}
    </div>
  );
}
