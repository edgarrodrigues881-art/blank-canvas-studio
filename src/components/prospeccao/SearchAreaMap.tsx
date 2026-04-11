import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

export default function SearchAreaMap({ cidade, estado, pais = "BR", onAreaConfirm, onAreaChange, onCityDetected, initialRadiusKm = 12 }: SearchAreaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const radiusInitializedRef = useRef(false);
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [changed, setChanged] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");

  const fitCircleBounds = useCallback((animate = false) => {
    const map = mapInstanceRef.current;
    const circle = circleRef.current;
    if (!map || !circle) return;
    requestAnimationFrame(() => {
      if (!mapInstanceRef.current || !circleRef.current) return;
      map.fitBounds(circle.getBounds(), { padding: [30, 30], animate });
    });
  }, []);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`, { headers: { "User-Agent": "ProspeccaoBot/1.0" } });
      const data = await res.json();
      const addr = data.address || {};
      const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
      if (cityName) { setLocationLabel(cityName); onCityDetected?.(cityName); }
    } catch { /* ignore */ }
  }, [onCityDetected]);

  useEffect(() => {
    if (cidade) return;
    mapInstanceRef.current?.remove();
    mapInstanceRef.current = null;
    markerRef.current = null;
    circleRef.current = null;
    setCenter(null);
    setLocationLabel("");
    setConfirmed(false);
    setChanged(false);
  }, [cidade]);

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
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=${cc}`, { headers: { "User-Agent": "ProspeccaoBot/1.0" } });
        const data = await res.json();
        if (!cancelled && data.length > 0) {
          const newCenter = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          setCenter(cur => {
            if (cur && Math.abs(cur.lat - newCenter.lat) < 0.0001 && Math.abs(cur.lng - newCenter.lng) < 0.0001) return cur;
            return newCenter;
          });
          setLocationLabel(cidade);
          setConfirmed(false);
          setChanged(false);
        }
      } catch { console.error("Geocoding failed"); }
      finally { if (!cancelled) setGeocoding(false); }
    };
    geocode();
    return () => { cancelled = true; };
  }, [cidade, estado, pais]);

  useEffect(() => {
    if (!center || !mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng], zoom: 12, zoomControl: false, attributionControl: false,
      scrollWheelZoom: true, preferCanvas: true, zoomSnap: 0.25, zoomDelta: 0.5,
      wheelPxPerZoomLevel: 180, fadeAnimation: false, markerZoomAnimation: false,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd", updateWhenIdle: true, keepBuffer: 2,
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:hsl(var(--primary));border:2px solid hsl(var(--background));box-shadow:0 0 0 3px hsl(var(--primary) / 0.3), 0 0 12px hsl(var(--primary) / 0.4);cursor:grab;"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7],
    });

    const marker = L.marker([center.lat, center.lng], { draggable: true, icon }).addTo(map);
    const circle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000, color: "hsl(var(--primary))", fillColor: "hsl(var(--primary))",
      fillOpacity: 0.12, weight: 2.5,
    }).addTo(map);

    marker.on("drag", () => circle.setLatLng(marker.getLatLng()));
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      setCenter(cur => {
        if (cur && Math.abs(cur.lat - pos.lat) < 0.0001 && Math.abs(cur.lng - pos.lng) < 0.0001) return cur;
        return { lat: pos.lat, lng: pos.lng };
      });
      setConfirmed(false); setChanged(true);
      reverseGeocode(pos.lat, pos.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    const handleResize = () => map.invalidateSize({ pan: false });
    const observer = new ResizeObserver(handleResize);
    observer.observe(mapRef.current);
    window.addEventListener("resize", handleResize);
    requestAnimationFrame(() => { handleResize(); fitCircleBounds(); });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, [center, fitCircleBounds, radiusKm, reverseGeocode]);

  useEffect(() => {
    const map = mapInstanceRef.current; const marker = markerRef.current; const circle = circleRef.current;
    if (!map || !marker || !circle || !center) return;
    const next = L.latLng(center.lat, center.lng);
    if (marker.getLatLng().distanceTo(next) < 1) return;
    marker.setLatLng(next); circle.setLatLng(next);
    map.setView(next, Math.max(map.getZoom(), 12), { animate: false });
    fitCircleBounds();
  }, [center, fitCircleBounds]);

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setRadius(radiusKm * 1000);
    fitCircleBounds();
    if (!radiusInitializedRef.current) { radiusInitializedRef.current = true; return; }
    setConfirmed(false); setChanged(true);
  }, [fitCircleBounds, radiusKm]);

  useEffect(() => { setRadiusKm(initialRadiusKm); }, [initialRadiusKm]);
  useEffect(() => { if (center && onAreaChange) onAreaChange(center.lat, center.lng, radiusKm); }, [center, radiusKm, onAreaChange]);

  const handleConfirm = () => {
    if (center && onAreaConfirm) onAreaConfirm(center.lat, center.lng, radiusKm);
    setConfirmed(true); setChanged(false);
  };

  if (!cidade) {
    return (
      <div className="w-full aspect-square max-h-[520px] rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center"><MapPin className="h-7 w-7 text-muted-foreground/40" /></div>
        <p className="text-muted-foreground/60 text-sm text-center px-4">Preencha a cidade para visualizar o mapa</p>
      </div>
    );
  }

  if (geocoding) {
    return (
      <div className="w-full aspect-square max-h-[520px] rounded-xl border border-border bg-muted/10 flex flex-col items-center justify-center gap-3">
        <Target className="h-8 w-8 text-primary animate-pulse" />
        <p className="text-muted-foreground text-sm">Localizando {cidade}...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div ref={mapRef} className="w-full aspect-square max-h-[520px] rounded-xl overflow-hidden border border-border" />
        {center && (
          <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50 space-y-0.5 max-w-[220px] z-[1000]">
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3 w-3 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">{locationLabel || cidade}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{center.lat.toFixed(4)}, {center.lng.toFixed(4)} · {radiusKm}km</p>
          </div>
        )}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 z-[1000]">
          <div className="bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-border/50 text-[11px] text-muted-foreground">Arraste o marcador para ajustar</div>
          {confirmed && !changed && (
            <div className="bg-primary/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-primary/30 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /><span className="text-[11px] font-medium text-primary">Área confirmada</span>
            </div>
          )}
          {changed && !confirmed && (
            <div className="bg-yellow-500/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-yellow-500/30">
              <span className="text-[11px] text-yellow-600 dark:text-yellow-400">Área alterada</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1">
        <Label className="text-sm whitespace-nowrap font-medium">Raio:</Label>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setRadiusKm(r => Math.max(2, r - 1))} className="h-8 w-8 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center hover:bg-muted/60 transition-colors"><Minus className="h-3.5 w-3.5 text-muted-foreground" /></button>
          <Input type="number" min={2} max={50} value={radiusKm} onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 2 && v <= 50) setRadiusKm(v); }}
            className="w-16 h-8 text-center text-sm font-medium tabular-nums rounded-lg bg-muted/30 border-border/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          <button type="button" onClick={() => setRadiusKm(r => Math.min(50, r + 1))} className="h-8 w-8 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center hover:bg-muted/60 transition-colors"><Plus className="h-3.5 w-3.5 text-muted-foreground" /></button>
          <span className="text-xs text-muted-foreground ml-0.5">km</span>
        </div>

        {center && (
          <Button size="sm" variant={confirmed && !changed ? "outline" : "default"} onClick={handleConfirm} className="gap-2">
            {confirmed && !changed ? (<><CheckCircle2 className="h-4 w-4" />Área confirmada</>) : (<><Target className="h-4 w-4" />Usar esta área</>)}
          </Button>
        )}
      </div>
    </div>
  );
}
