import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LeafletMapProps {
  center: { lat: number; lng: number };
  radiusKm: number;
  onMarkerMove?: (lat: number, lng: number) => void;
}

export default function LeafletMap({ center, radiusKm, onMarkerMove }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      fadeAnimation: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 180,
    });

    L.control.zoom({ position: "topright" }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width:14px;height:14px;border-radius:50%;
        background:hsl(160,60%,45%);border:2px solid hsl(var(--background));
        box-shadow:0 0 0 3px hsla(160,60%,45%,0.3), 0 0 12px hsla(160,60%,45%,0.4);
        cursor:grab;
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const marker = L.marker([center.lat, center.lng], { draggable: true, icon }).addTo(map);
    const circle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: "hsl(160,60%,45%)",
      fillColor: "hsl(160,60%,45%)",
      fillOpacity: 0.1,
      weight: 2,
    }).addTo(map);

    marker.on("drag", () => circle.setLatLng(marker.getLatLng()));
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      onMarkerMove?.(pos.lat, pos.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    // Fit to circle bounds
    requestAnimationFrame(() => {
      map.invalidateSize();
      map.fitBounds(circle.getBounds(), { padding: [30, 30] });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []); // mount once

  // Update center
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    const latlng = L.latLng(center.lat, center.lng);
    if (markerRef.current.getLatLng().distanceTo(latlng) < 1) return;
    markerRef.current.setLatLng(latlng);
    circleRef.current.setLatLng(latlng);
    mapRef.current.setView(latlng, Math.max(mapRef.current.getZoom(), 12), { animate: true });
  }, [center]);

  // Update radius
  useEffect(() => {
    if (!circleRef.current || !mapRef.current) return;
    circleRef.current.setRadius(radiusKm * 1000);
    mapRef.current.fitBounds(circleRef.current.getBounds(), { padding: [30, 30], animate: true });
  }, [radiusKm]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ pan: false });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
