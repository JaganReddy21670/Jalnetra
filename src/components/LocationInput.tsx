"use client";

import clsx from "clsx";
import { Loader2, LocateFixed } from "lucide-react";
import { useState } from "react";
import { inputCls } from "./ui";

export interface LocValue {
  location: string;
  lat: string;
  lng: string;
}

export const locFromDevice = (d: { location: string; lat?: number; lng?: number }): LocValue => ({
  location: d.location,
  lat: d.lat !== undefined ? String(d.lat) : "",
  lng: d.lng !== undefined ? String(d.lng) : "",
});

/** Turn the form strings into API fields (null clears coordinates). */
export const locToApi = (v: LocValue) => ({
  location: v.location.trim(),
  lat: v.lat.trim() === "" ? null : Number(v.lat),
  lng: v.lng.trim() === "" ? null : Number(v.lng),
});

export function coordsError(v: LocValue): string | null {
  const a = v.lat.trim();
  const b = v.lng.trim();
  if (!a && !b) return null;
  if (!a || !b) return "Enter both latitude and longitude";
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return "Latitude must be between -90 and 90";
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return "Longitude must be between -180 and 180";
  return null;
}

/**
 * Location text + latitude/longitude. Coordinates can be typed in or filled
 * automatically from the phone/laptop GPS with one tap.
 */
export function LocationFields({ value, onChange, invalidLocation, compact }: { value: LocValue; onChange: (v: LocValue) => void; invalidLocation?: boolean; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const err = coordsError(value);

  function locate() {
    if (!("geolocation" in navigator)) return setMsg({ text: "GPS isn't available on this device", ok: false });
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ ...value, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) });
        setMsg({ text: `Location captured (±${Math.round(pos.coords.accuracy)} m)`, ok: true });
        setBusy(false);
      },
      (e) => {
        setMsg({ text: e.code === 1 ? "Location permission denied. Allow it in the browser, or type the numbers." : "Couldn't get your location. Try again outdoors.", ok: false });
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div className="w-full space-y-2">
      <input
        className={clsx(inputCls, invalidLocation && "ring-2 ring-ios-red/60")}
        value={value.location}
        onChange={(e) => onChange({ ...value, location: e.target.value })}
        placeholder="Deployed location, e.g. Hostel Block C roof *"
      />
      <div className={clsx("grid gap-2", compact ? "grid-cols-[1fr_1fr_auto]" : "grid-cols-[1fr_1fr_auto]")}>
        <input
          className={clsx(inputCls, "font-mono text-[14px]", err && "ring-2 ring-ios-red/50")}
          inputMode="decimal"
          value={value.lat}
          onChange={(e) => onChange({ ...value, lat: e.target.value })}
          placeholder="Latitude"
          aria-label="Latitude"
        />
        <input
          className={clsx(inputCls, "font-mono text-[14px]", err && "ring-2 ring-ios-red/50")}
          inputMode="decimal"
          value={value.lng}
          onChange={(e) => onChange({ ...value, lng: e.target.value })}
          placeholder="Longitude"
          aria-label="Longitude"
        />
        <button
          type="button"
          onClick={locate}
          title="Fill latitude and longitude from my current GPS position"
          className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-ios-blue/10 px-3 text-[14px] font-semibold text-ios-blue transition hover:bg-ios-blue/15 active:scale-95"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" strokeWidth={2.4} />}
          Auto
        </button>
      </div>
      {(err || msg) && <p className={clsx("text-[12px]", err || !msg?.ok ? "text-ios-red" : "text-[#248A3D]")}>{err ?? msg?.text}</p>}
    </div>
  );
}
