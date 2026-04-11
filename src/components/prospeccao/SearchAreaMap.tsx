import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Globe from "react-globe.gl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Target, CheckCircle2, Navigation, Minus, Plus } from "lucide-react";
import { getCountryNameByCode } from "@/lib/regionNames";

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
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [changed, setChanged] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });

  // Resize observer for container
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
      } catch {
        /* ignore */
      }
    },
    [onCityDetected]
  );

  // Reset when city is cleared
  useEffect(() => {
    if (cidade) return;
    setCenter(null);
    setLocationLabel("");
    setConfirmed(false);
    setChanged(false);
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
            if (
              cur &&
              Math.abs(cur.lat - newCenter.lat) < 0.0001 &&
              Math.abs(cur.lng - newCenter.lng) < 0.0001
            )
              return cur;
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
    return () => {
      cancelled = true;
    };
  }, [cidade, estado, pais]);

  // Fly to city when center changes
  useEffect(() => {
    if (!center || !globeRef.current) return;
    const altitude = Math.max(0.3, radiusKm / 200);
    globeRef.current.pointOfView(
      { lat: center.lat, lng: center.lng, altitude },
      1000
    );
  }, [center, radiusKm]);

  // Sync radius
  useEffect(() => {
    setRadiusKm(initialRadiusKm);
  }, [initialRadiusKm]);

  // Notify parent
  useEffect(() => {
    if (center && onAreaChange) onAreaChange(center.lat, center.lng, radiusKm);
  }, [center, radiusKm, onAreaChange]);

  // Globe data
  const markerData = useMemo(
    () => (center ? [{ lat: center.lat, lng: center.lng, size: 0.6 }] : []),
    [center]
  );

  const ringData = useMemo(
    () =>
      center
        ? [
            {
              lat: center.lat,
              lng: center.lng,
              maxR: radiusKm / 111.32, // convert km to degrees approx
              propagationSpeed: 2,
              repeatPeriod: 800,
            },
          ]
        : [],
    [center, radiusKm]
  );

  // Handle globe click to move marker
  const handleGlobeClick = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      if (!cidade) return; // only allow clicks when a city is selected
      setCenter({ lat, lng });
      setConfirmed(false);
      setChanged(true);
      reverseGeocode(lat, lng);
    },
    [cidade, reverseGeocode]
  );

  const handleConfirm = () => {
    if (center && onAreaConfirm) {
      onAreaConfirm(center.lat, center.lng, radiusKm);
    }
    setConfirmed(true);
    setChanged(false);
  };

  if (!cidade) {
    return (
      <div className="w-full aspect-[4/3] max-h-[400px] rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
          <MapPin className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground/60 text-sm text-center px-4">
          Preencha a cidade para visualizar o globo
        </p>
      </div>
    );
  }

  if (geocoding) {
    return (
      <div className="w-full aspect-[4/3] max-h-[400px] rounded-xl border border-border bg-muted/10 flex flex-col items-center justify-center gap-3">
        <Target className="h-8 w-8 text-primary animate-pulse" />
        <p className="text-muted-foreground text-sm">Localizando {cidade}...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          ref={containerRef}
          className="w-full aspect-[4/3] max-h-[400px] rounded-xl overflow-hidden border border-border bg-[#0a0a1a]"
        >
          <Globe
            ref={globeRef}
            width={dimensions.width}
            height={dimensions.height}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
            backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
            pointsData={markerData}
            pointLat="lat"
            pointLng="lng"
            pointColor={() => "hsl(142, 71%, 45%)"}
            pointAltitude={0.01}
            pointRadius="size"
            ringsData={ringData}
            ringLat="lat"
            ringLng="lng"
            ringMaxRadius="maxR"
            ringPropagationSpeed="propagationSpeed"
            ringRepeatPeriod="repeatPeriod"
            ringColor={() => (t: number) => `rgba(34,197,94,${1 - t})`}
            atmosphereColor="hsl(142, 71%, 45%)"
            atmosphereAltitude={0.2}
            onGlobeClick={handleGlobeClick}
            animateIn={true}
            enablePointerInteraction={true}
          />
        </div>

        {center && (
          <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50 space-y-0.5 max-w-[220px] pointer-events-none">
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

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border/50 text-[11px] text-muted-foreground">
            Clique no globo para ajustar
          </div>
          {confirmed && !changed && (
            <div className="bg-primary/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-primary/30 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium text-primary">Área confirmada</span>
            </div>
          )}
          {changed && !confirmed && (
            <div className="bg-yellow-500/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-yellow-500/30">
              <span className="text-[11px] text-yellow-600 dark:text-yellow-400">
                Área alterada
              </span>
            </div>
          )}
        </div>
      </div>

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
