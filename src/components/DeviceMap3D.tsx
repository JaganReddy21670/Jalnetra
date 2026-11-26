"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, Marker, StyleSpecification } from "maplibre-gl";
import type { MapPoint } from "./DeviceMap";

// Free, key-less sources.
const STREETS_3D = "https://tiles.openfreemap.org/styles/liberty"; // vector map with building heights
const SATELLITE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "sat", type: "raster", source: "sat" }],
};

/** 3D map (tilted camera, extruded buildings) or tilted satellite view, with coloured device markers. */
export function DeviceMap3D({ points, focusId, mode, className }: { points: MapPoint[]; focusId?: string | null; mode: "3d" | "satellite"; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [failed, setFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = (await import("maplibre-gl")).default;
      if (cancelled || !el.current) return;
      const first = points[0];
      let m: MLMap;
      try {
        m = new ml.Map({
          container: el.current,
          style: mode === "satellite" ? SATELLITE : STREETS_3D,
          center: first ? [first.lng, first.lat] : [78.9, 20.6],
          zoom: first ? 15 : 4,
          pitch: 62,
          bearing: -24,
          maxPitch: 80,
          attributionControl: { compact: true },
        });
      } catch {
        setFailed("Your browser doesn't support 3D maps (WebGL is turned off).");
        return;
      }
      map.current = m;
      setLoading(true);
      setSlow(false);
      const slowTimer = window.setTimeout(() => setSlow(true), 15000);
      m.once("idle", () => {
        window.clearTimeout(slowTimer);
        setLoading(false);
      });
      m.addControl(new ml.NavigationControl({ visualizePitch: true }), "bottom-right");

      m.on("load", () => {
        // Extruded 3D buildings (street mode). Use the style's own layer if present.
        if (mode === "3d" && !m.getStyle().layers.some((l) => l.type === "fill-extrusion") && m.getSource("openmaptiles")) {
          m.addLayer({
            id: "fc-3d-buildings",
            type: "fill-extrusion",
            source: "openmaptiles",
            "source-layer": "building",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#dfe3ea",
              "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
              "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
              "fill-extrusion-opacity": 0.85,
            },
          });
        }
        if (points.length > 1) {
          const b = new ml.LngLatBounds();
          points.forEach((p) => b.extend([p.lng, p.lat]));
          m.fitBounds(b, { padding: 90, maxZoom: 17, pitch: 62, bearing: -24, duration: 0 });
        }
      });

      for (const p of points) {
        const dot = document.createElement("div");
        dot.className = "fc-marker";
        dot.style.setProperty("--c", p.color);
        const mk = new ml.Marker({ element: dot })
          .setLngLat([p.lng, p.lat])
          .setPopup(new ml.Popup({ offset: 16, closeButton: false, className: "fc-popup3d", maxWidth: "260px" }).setHTML(p.html))
          .addTo(m);
        markers.current.set(p.id, mk);
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((mk) => mk.remove());
      markers.current.clear();
      map.current?.remove();
      map.current = null;
    };
    // Rebuild when the device set, colours or mode change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, JSON.stringify(points.map((p) => [p.id, p.lat, p.lng, p.color]))]);

  useEffect(() => {
    if (!focusId || !map.current) return;
    const mk = markers.current.get(focusId);
    if (!mk) return;
    map.current.flyTo({ center: mk.getLngLat(), zoom: 17.5, pitch: 65, bearing: map.current.getBearing() - 30, duration: 1400, essential: true });
    if (!mk.getPopup()?.isOpen()) mk.togglePopup();
  }, [focusId]);

  if (failed) return <div className="flex h-full items-center justify-center p-8 text-center text-[15px] text-ios-gray">{failed}</div>;
  return (
    <div className="relative h-full w-full">
      <div ref={el} className={className} />
      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex flex-col items-center justify-center gap-2 bg-white/40 backdrop-blur-sm">
          <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-ios-blue/25 border-t-ios-blue" />
          <span className="text-[13px] font-medium text-ios-gray">{slow ? "Still loading… slow connection? Try Satellite or 2D." : "Loading 3D map…"}</span>
        </div>
      )}
    </div>
  );
}
