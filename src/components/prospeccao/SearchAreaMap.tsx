import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Target, CheckCircle2, Navigation } from "lucide-react";

interface SearchAreaMapProps {
  cidade: string;
  estado: string;
  onAreaConfirm?: (lat: number, lng: number, radiusKm: number) => void;
  onAreaChange?: (lat: number, lng: number, radiusKm: number) => void;
  initialRadiusKm?: number;
}

export default function SearchAreaMap({ cidade, estado, onAreaConfirm, onAreaChange, initialRadiusKm = 12 }: SearchAreaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!cidade || !estado) return;
    let cancelled = false;
    const geocode = async () => {
      setGeocoding(true);
      try {
        const q = encodeURIComponent(`${cidade}, ${estado}, Brazil`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
        const data = await res.json();
        if (!cancelled && data.length > 0) {
          setCenter({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
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
  }, [cidade, estado]);

  useEffect(() => {
    if (!center || !mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    // Carto Voyager - clean and readable
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      subdomains: "abcd",
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width:16px;height:16px;border-radius:50%;
        background:hsl(142,71%,45%);border:2.5px solid white;
        box-shadow:0 0 8px rgba(74,222,128,0.6);
        cursor:grab;
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const marker = L.marker([center.lat, center.lng], { draggable: true, icon }).addTo(map);

    const circle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: "hsl(142,71%,45%)",
      fillColor: "hsl(142,71%,45%)",
      fillOpacity: 0.08,
      weight: 2.5,
      dashArray: "6 4",
    }).addTo(map);

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      setCenter({ lat: pos.lat, lng: pos.lng });
      setConfirmed(false);
      setChanged(true);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(circle.getBounds(), { padding: [30, 30] });
    }, 150);

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, [center?.lat, center?.lng]);

  useEffect(() => {
    if (circleRef.current) circleRef.current.setRadius(radiusKm * 1000);
    if (mapInstanceRef.current && circleRef.current) {
      mapInstanceRef.current.fitBounds(circleRef.current.getBounds(), { padding: [30, 30] });
    }
    setConfirmed(false);
    setChanged(true);
  }, [radiusKm]);

  useEffect(() => {
    if (center && onAreaChange) onAreaChange(center.lat, center.lng, radiusKm);
  }, [center, radiusKm, onAreaChange]);

  const handleConfirm = () => {
    if (center && onAreaConfirm) {
      onAreaConfirm(center.lat, center.lng, radiusKm);
    }
    setConfirmed(true);
    setChanged(false);
  };

  if (!cidade || !estado) {
    return (
      <div className="w-full aspect-[4/3] max-h-[400px] rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
          <MapPin className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <p className="text-muted-foreground/60 text-sm">Selecione estado e cidade para visualizar o mapa</p>
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
        <div ref={mapRef} className="w-full aspect-[4/3] max-h-[400px] rounded-xl overflow-hidden border border-border" />

        {/* Info overlay - top left */}
        {center && (
          <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50 space-y-0.5 max-w-[220px]">
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3 w-3 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">{cidade}, {estado}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {center.lat.toFixed(4)}, {center.lng.toFixed(4)} · {radiusKm}km
            </p>
          </div>
        )}

        {/* Status overlay - bottom */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <div className="bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border/50 text-[11px] text-muted-foreground">
            Arraste o marcador para ajustar
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

      {/* Controls */}
      <div className="flex items-center gap-4 px-1">
        <Label className="text-sm whitespace-nowrap font-medium">Raio: {radiusKm} km</Label>
        <Slider
          value={[radiusKm]}
          onValueChange={([v]) => setRadiusKm(v)}
          min={2}
          max={30}
          step={1}
          className="flex-1"
        />
      </div>

      {/* Confirm area button */}
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
