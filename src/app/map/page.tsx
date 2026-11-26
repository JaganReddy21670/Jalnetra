"use client";

import clsx from "clsx";
import { LocateOff, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi, useNow, useSession } from "@/components/session";
import { Card, DayBadge, DeviceIcon, PageHeader, Segmented, Spinner, dayMeta } from "@/components/ui";
import { deviceType, type Device, type Inspection, type PublicUser } from "@/lib/devices";
import { fmtTime, istParts } from "@/lib/format";
import { dayState, indexInspections, shiftDate, uptime, type DayState } from "@/lib/status";
import type { MapPoint } from "@/components/DeviceMap";

const DeviceMap3D = dynamic(() => import("@/components/DeviceMap3D").then((m) => m.DeviceMap3D), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center"><Spinner /></div>,
});

const DeviceMap = dynamic(() => import("@/components/DeviceMap").then((m) => m.DeviceMap), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center"><Spinner /></div>,
});

const COLORS: Record<DayState, string> = { healthy: "#34C759", issue: "#FF3B30", late: "#FF9500", pending: "#FFCC00", missed: "#8E8E93" };
type Filter = "all" | DayState;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MapPage() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const now = useNow(60000);
  const today = now ? istParts(now).date : null;
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const insRes = useApi<{ inspections: Inspection[] }>(today ? `/api/inspections?from=${shiftDate(today, -29)}&to=${today}` : null);
  const usersRes = useApi<{ users: PublicUser[] }>(isAdmin ? "/api/users" : null);
  const [filter, setFilter] = useState<Filter>("all");
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<"2D" | "3D" | "Satellite">("3D");
  // Allow /map?view=2D|3D|Satellite (handy for bookmarks).
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "2D" || v === "3D" || v === "Satellite") setView(v);
  }, []);

  const rows = useMemo(() => {
    if (!devRes.data || !insRes.data || !now || !today) return null;
    const idx = indexInspections(insRes.data.inspections);
    const users = usersRes.data?.users ?? [];
    return devRes.data.devices
      .filter((d) => d.active)
      .map((d) => {
        const ins = idx.get(`${d.id}|${today}`);
        return { d, ins, st: dayState(d, ins, today, now) ?? "pending", up: uptime(d, idx, today), eng: users.find((u) => u.id === d.engineerId)?.name ?? (d.engineerId === user?.id ? user?.name : "") };
      });
  }, [devRes.data, insRes.data, usersRes.data, now, today, user]);

  const visible = (rows ?? []).filter((r) => filter === "all" || r.st === filter);
  const located = visible.filter((r) => r.d.lat !== undefined && r.d.lng !== undefined);
  const missing = visible.filter((r) => r.d.lat === undefined);

  const points: MapPoint[] = useMemo(
    () =>
      located.map(({ d, ins, st, up, eng }) => ({
        id: d.id,
        lat: d.lat!,
        lng: d.lng!,
        color: COLORS[st],
        html: `<div style="font:13px -apple-system,BlinkMacSystemFont,Inter,sans-serif;min-width:190px">
          <div style="font-weight:700;font-size:15px">${esc(d.name)}</div>
          <div style="color:#8E8E93">${esc(deviceType(d.type).label)}${eng ? " · " + esc(eng) : ""}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:9px;background:${COLORS[st]}"></span><b>${dayMeta[st].label}</b>${ins ? ` <span style="color:#8E8E93">at ${fmtTime(ins.submittedAt)}</span>` : ""}</div>
          ${ins?.answers.offlineReason ? `<div style="color:#D70015;margin-top:2px">${esc(ins.answers.offlineReason)}</div>` : ""}
          <div style="margin-top:4px;color:#3C3C43">Uptime (30d): <b>${up.pct === null ? "—" : up.pct + "%"}</b></div>
          <div style="margin-top:4px;color:#8E8E93">${esc(d.location)}</div>
          <div style="margin-top:2px;color:#8E8E93;font-family:ui-monospace,monospace;font-size:12px">${d.lat!.toFixed(5)}, ${d.lng!.toFixed(5)}</div>
        </div>`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(located.map((r) => [r.d.id, r.st, r.d.lat, r.d.lng, r.up.pct]))],
  );

  if (!rows) return <div className="flex justify-center py-24"><Spinner /></div>;
  const count = (s: Filter) => (s === "all" ? rows.length : rows.filter((r) => r.st === s).length);

  return (
    <>
      <PageHeader title="Map" subtitle={`${located.length} of ${visible.length} devices have a GPS location · coloured by today's status`} />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {(["all", "healthy", "issue", "pending", "missed", "late"] as Filter[]).map((f) => {
          const n = count(f);
          if (f !== "all" && n === 0) return null;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx("inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition", filter === f ? "bg-ios-label text-white" : "bg-white/60 text-ios-label ring-1 ring-black/[0.05] hover:bg-white/90")}
            >
              {f !== "all" && <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[f] }} />}
              {f === "all" ? "All" : dayMeta[f].label}
              <span className={filter === f ? "text-white/60" : "text-ios-gray"}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="relative h-[58vh] overflow-hidden p-0 lg:h-[calc(100vh-230px)]">
          {located.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <LocateOff className="h-8 w-8 text-ios-gray" />
              <p className="mt-3 text-[17px] font-semibold">No GPS locations yet</p>
              <p className="mt-1 max-w-sm text-[15px] text-ios-gray">Edit a device and enter its latitude and longitude, or tap Auto while standing at the device.</p>
              <Link href="/devices" className="mt-4 text-[15px] font-semibold text-ios-blue">Go to Devices</Link>
            </div>
          ) : (
            <>
              {view === "2D" ? (
                <DeviceMap points={points} focusId={focus} className="h-full w-full" />
              ) : (
                <DeviceMap3D key={view} mode={view === "3D" ? "3d" : "satellite"} points={points} focusId={focus} className="h-full w-full" />
              )}
              <div className="absolute left-3 top-3 z-[500] w-[220px]">
                <div className="rounded-[13px] bg-white/80 p-[3px] shadow-[0_4px_16px_rgba(31,41,79,0.15)] backdrop-blur-xl">
                  <Segmented value={view} options={["2D", "3D", "Satellite"] as const} onChange={(v) => { setView(v); setFocus(null); }} neutral />
                </div>
              </div>
              {view !== "2D" && (
                <p className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium text-white backdrop-blur">
                  Right-click + drag (or two fingers) to tilt and rotate
                </p>
              )}
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <p className="section-label px-5 pb-1 pt-4">On the map · {located.length}</p>
            <ul className="max-h-[42vh] divide-y divide-ios-separator overflow-y-auto scrollbar-thin">
              {located.map(({ d, st, up }) => (
                <li key={d.id}>
                  <button onClick={() => setFocus(d.id)} className={clsx("flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/50", focus === d.id && "bg-white/60")}>
                    <DeviceIcon type={d.type} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{d.name}</p>
                      <p className="text-[12px] text-ios-gray">Uptime {up.pct === null ? "—" : `${up.pct}%`}</p>
                    </div>
                    <DayBadge state={st} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {missing.length > 0 && (
            <Card className="overflow-hidden">
              <p className="section-label px-5 pb-1 pt-4">No GPS yet · {missing.length}</p>
              <ul className="max-h-[24vh] divide-y divide-ios-separator overflow-y-auto scrollbar-thin">
                {missing.map(({ d }) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <DeviceIcon type={d.type} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold">{d.name}</p>
                      <p className="flex items-center gap-1 truncate text-[12px] text-ios-gray"><MapPin className="h-3 w-3" />{d.location}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="px-5 pb-4 pt-2 text-[12px] text-ios-gray">Add latitude and longitude on the Devices page (type them, or tap Auto at the site).</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
