import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { MapPin, Target } from "lucide-react";

interface SearchAreaMapProps {
  cidade: string;
  estado: string;
  onAreaChange?: (lat: number, lng: number, radiusKm: number) => void;
  initialRadiusKm?: number;
}

export default function SearchAreaMap({ cidade, estado, onAreaChange, initialRadiusKm = 12 }: SearchAreaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

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

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width:36px;height:36px;border-radius:50%;
        background:hsl(142,71%,45%);border:3px solid rgba(255,255,255,0.9);
        box-shadow:0 0 12px rgba(74,222,128,0.5),0 2px 8px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        cursor:grab;
      "><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const marker = L.marker([center.lat, center.lng], { draggable: true, icon }).addTo(map);

    const circle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: "rgba(74,222,128,0.6)",
      fillColor: "rgba(74,222,128,0.08)",
      fillOpacity: 0.15,
      weight: 2,
      dashArray: "8 5",
    }).addTo(map);

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      setCenter({ lat: pos.lat, lng: pos.lng });
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
  }, [radiusKm]);

  useEffect(() => {
    if (center && onAreaChange) onAreaChange(center.lat, center.lng, radiusKm);
  }, [center, radiusKm, onAreaChange]);

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
        {/* Overlay info */}
        <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border/50 text-xs text-muted-foreground">
          Arraste o marcador para ajustar o centro
        </div>
      </div>
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
    </div>
  );
}
