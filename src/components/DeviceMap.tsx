"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LMap, LayerGroup } from "leaflet";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  html: string; // popup content (already escaped)
}

/** Leaflet map with coloured circle markers. Loaded client-side only. */
export function DeviceMap({ points, focusId, className }: { points: MapPoint[]; focusId?: string | null; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const markers = useRef(new Map<string, import("leaflet").CircleMarker>());
  const fitted = useRef(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([20.6, 78.9], 5);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      map.current = m;
      layer.current = L.layerGroup().addTo(m);
      draw(L);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      fitted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(L: typeof import("leaflet")) {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    for (const p of points) {
      const mk = L.circleMarker([p.lat, p.lng], { radius: 10, color: "#fff", weight: 3, fillColor: p.color, fillOpacity: 1 })
        .bindPopup(p.html, { closeButton: false, className: "fc-popup" })
        .addTo(layer.current);
      markers.current.set(p.id, mk);
    }
    if (!fitted.current && points.length) {
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      map.current.fitBounds(b.pad(0.25), { maxZoom: 16 });
      fitted.current = true;
    }
  }

  // Redraw when points change.
  useEffect(() => {
    import("leaflet").then((L) => draw(L));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Fly to a device when chosen from the list.
  useEffect(() => {
    if (!focusId || !map.current) return;
    const mk = markers.current.get(focusId);
    if (!mk) return;
    map.current.flyTo(mk.getLatLng(), Math.max(map.current.getZoom(), 16), { duration: 0.6 });
    mk.openPopup();
  }, [focusId]);

  return <div ref={el} className={className} />;
}
