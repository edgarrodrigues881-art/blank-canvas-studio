import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  // Geocode city
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
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          setCenter({ lat, lng });
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

  // Initialize map
  useEffect(() => {
    if (!center || !mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    // Custom marker icon
    const icon = L.divIcon({
      className: "custom-map-marker",
      html: `<div style="
        width:32px;height:32px;border-radius:50%;
        background:hsl(var(--primary));border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
      "><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><circle cx="12" cy="12" r="4"/></svg></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const marker = L.marker([center.lat, center.lng], {
      draggable: true,
      icon,
    }).addTo(map);

    const circle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: "hsl(221, 83%, 53%)",
      fillColor: "hsl(221, 83%, 53%)",
      fillOpacity: 0.08,
      weight: 2,
      dashArray: "6 4",
    }).addTo(map);

    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      setCenter({ lat: pos.lat, lng: pos.lng });
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [center?.lat, center?.lng]);

  // Update circle radius
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusKm * 1000);
    }
    if (mapInstanceRef.current && circleRef.current) {
      mapInstanceRef.current.fitBounds(circleRef.current.getBounds(), { padding: [20, 20] });
    }
  }, [radiusKm]);

  // Notify parent
  useEffect(() => {
    if (center && onAreaChange) {
      onAreaChange(center.lat, center.lng, radiusKm);
    }
  }, [center, radiusKm, onAreaChange]);

  if (!cidade || !estado) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <MapPin className="h-5 w-5" />
          <span>Selecione estado e cidade para visualizar o mapa</span>
        </CardContent>
      </Card>
    );
  }

  if (geocoding) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Target className="h-5 w-5 animate-pulse" />
          <span>Localizando {cidade}...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          Área de Busca
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={mapRef} className="w-full h-[300px] rounded-lg border overflow-hidden" />
        <div className="flex items-center gap-4">
          <Label className="text-sm whitespace-nowrap min-w-fit">Raio: {radiusKm} km</Label>
          <Slider
            value={[radiusKm]}
            onValueChange={([v]) => setRadiusKm(v)}
            min={2}
            max={30}
            step={1}
            className="flex-1"
          />
        </div>
        {center && (
          <p className="text-xs text-muted-foreground">
            Centro: {center.lat.toFixed(4)}, {center.lng.toFixed(4)} — Arraste o marcador para ajustar
          </p>
        )}
      </CardContent>
    </Card>
  );
}
