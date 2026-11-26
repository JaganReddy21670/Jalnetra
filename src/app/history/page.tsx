"use client";

import clsx from "clsx";
import { ChevronRight, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SubmittedView } from "@/components/InspectionView";
import { useApi, useNow, useSession } from "@/components/session";
import { Avatar, Card, DayBadge, DeviceIcon, Empty, PageHeader, Sheet, Spinner } from "@/components/ui";
import { DEVICE_TYPES, type Device, type Inspection, type PublicUser } from "@/lib/devices";
import { fmtDate, fmtTime, istParts } from "@/lib/format";
import { shiftDate } from "@/lib/status";

const DAYS = 21;
type Filter = "All" | "Online" | "Offline" | "Late";

export default function HistoryPage() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const now = useNow(60000);
  const today = now ? istParts(now).date : null;
  const from = today ? shiftDate(today, -(DAYS - 1)) : null;
  const insRes = useApi<{ inspections: Inspection[] }>(from && today ? `/api/inspections?from=${from}&to=${today}` : null);
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const usersRes = useApi<{ users: PublicUser[] }>(isAdmin ? "/api/users" : null);
  const [day, setDay] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [eng, setEng] = useState<string | null>(null);
  const [open, setOpen] = useState<Inspection | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const selected = day ?? today;
  const devices = useMemo(() => new Map((devRes.data?.devices ?? []).map((d) => [d.id, d])), [devRes.data]);
  const users = usersRes.data?.users ?? [];
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? user?.name ?? "—";
  const all = useMemo(() => (insRes.data?.inspections ?? []).filter((i) => !eng || i.engineerId === eng), [insRes.data, eng]);

  // Per-day summary for the ring on each day pill.
  const dates = today ? Array.from({ length: DAYS }, (_, k) => shiftDate(today, -(DAYS - 1 - k))) : [];
  const summary = useMemo(() => {
    const active = (devRes.data?.devices ?? []).filter((d) => d.active && (!eng || d.engineerId === eng));
    const m = new Map<string, { done: number; expected: number; offline: number }>();
    for (const date of dates) {
      const expected = active.filter((d) => istParts(new Date(d.createdAt)).date <= date).length;
      const list = all.filter((i) => i.date === date);
      m.set(date, { done: list.length, expected, offline: list.filter((i) => i.answers.dataStatus === "Offline").length });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devRes.data, all, eng, today]);

  const dayList = all.filter((i) => i.date === selected);
  const counts = {
    All: dayList.length,
    Online: dayList.filter((i) => i.answers.dataStatus === "Online").length,
    Offline: dayList.filter((i) => i.answers.dataStatus === "Offline").length,
    Late: dayList.filter((i) => i.late).length,
  };
  const shown = dayList
    .filter((i) => filter === "All" || (filter === "Late" ? i.late : i.answers.dataStatus === filter))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const grouped = DEVICE_TYPES.map((t) => ({ t, list: shown.filter((i) => devices.get(i.deviceId)?.type === t.key) })).filter((g) => g.list.length);

  // Keep today's pill in view on first load.
  useEffect(() => {
    if (strip.current) strip.current.scrollLeft = strip.current.scrollWidth;
  }, [today, insRes.data]);

  if (!today || !selected) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <>
      <PageHeader title="History" subtitle={selected === today ? "Today" : fmtDate(selected)} />

      {/* Day strip */}
      <div ref={strip} className="-mx-4 mb-5 flex snap-x gap-2 overflow-x-auto px-4 pb-2 scrollbar-thin">
        {dates.map((date) => {
          const s = summary.get(date)!;
          const active = date === selected;
          const d = new Date(`${date}T00:00:00Z`);
          const pct = s.expected ? Math.min(1, s.done / s.expected) : 0;
          const color = s.offline > 0 ? "#FF3B30" : s.expected && s.done >= s.expected ? "#34C759" : s.done ? "#FF9500" : "rgba(120,120,128,0.25)";
          return (
            <button
              key={date}
              onClick={() => setDay(date)}
              className={clsx(
                "flex w-[58px] shrink-0 snap-end flex-col items-center gap-1.5 rounded-[18px] py-2.5 transition active:scale-95",
                active ? "bg-ios-blue text-white shadow-[0_6px_18px_rgba(0,122,255,0.35)]" : "glass hover:bg-white/70",
              )}
            >
              <span className={clsx("text-[11px] font-semibold uppercase", active ? "text-white/80" : "text-ios-gray")}>
                {d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }).slice(0, 3)}
              </span>
              <span className="text-[19px] font-bold leading-none tabular-nums">{d.getUTCDate()}</span>
              <Ring pct={pct} color={active ? "#fff" : color} track={active ? "rgba(255,255,255,0.3)" : "rgba(120,120,128,0.15)"} />
            </button>
          );
        })}
      </div>

      {/* Engineer avatars (admin) */}
      {isAdmin && users.length > 0 && (
        <div className="-mx-4 mb-5 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-thin">
          <PersonChip active={!eng} onClick={() => setEng(null)} label="Everyone">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ios-fill text-[13px] font-bold text-ios-label">All</span>
          </PersonChip>
          {users.filter((u) => u.role === "engineer").map((u) => (
            <PersonChip key={u.id} active={eng === u.id} onClick={() => setEng(eng === u.id ? null : u.id)} label={u.name.split(" ")[0]}>
              <Avatar name={u.name} picture={u.picture} size={44} />
            </PersonChip>
          ))}
        </div>
      )}

      {/* Result tabs */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {(["All", "Online", "Offline", "Late"] as Filter[]).map((f) => {
          const dot = f === "Online" ? "bg-ios-green" : f === "Offline" ? "bg-ios-red" : f === "Late" ? "bg-ios-orange" : "";
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition",
                filter === f ? "bg-ios-label text-white" : "bg-white/60 text-ios-label ring-1 ring-black/[0.05] hover:bg-white/90",
              )}
            >
              {dot && <span className={clsx("h-2 w-2 rounded-full", dot)} />}
              {f}
              <span className={clsx("tabular-nums", filter === f ? "text-white/60" : "text-ios-gray")}>{counts[f]}</span>
            </button>
          );
        })}
      </div>

      {insRes.loading && !insRes.data ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : grouped.length === 0 ? (
        <Card>
          <Empty
            title={dayList.length ? `No ${filter.toLowerCase()} checks` : "No checks this day"}
            text={selected === today ? "Checks submitted today will appear here." : "Nothing was recorded on this day."}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ t, list }) => (
            <section key={t.key} className="animate-rise">
              <h2 className="section-label mb-2 px-2">{t.label} · {list.length}</h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-ios-separator">
                  {list.map((i) => {
                    const d = devices.get(i.deviceId);
                    return (
                      <li key={i.id}>
                        <button onClick={() => setOpen(i)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition hover:bg-white/50">
                          {d && <DeviceIcon type={d.type} size={38} />}
                          <div className="min-w-0 flex-1">
                            <p className={clsx("truncate text-[15px] font-semibold", d && !d.active && "text-ios-gray")}>{d?.name ?? i.deviceId}</p>
                            <p className="flex items-center gap-1 truncate text-[13px] text-ios-gray">
                              {fmtTime(i.submittedAt)}
                              {isAdmin && ` · ${nameOf(i.engineerId)}`}
                              {i.answers.offlineReason ? ` · ${i.answers.offlineReason}` : d?.location ? <> · <MapPin className="h-3 w-3 shrink-0" />{d.location}</> : null}
                            </p>
                          </div>
                          <DayBadge state={i.answers.dataStatus === "Offline" ? "issue" : i.late ? "late" : "healthy"} />
                          <ChevronRight className="h-4 w-4 text-black/25" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? devices.get(open.deviceId)?.name ?? open.deviceId : ""}>
        {open && (
          <>
            {isAdmin && <p className="mb-3 text-[13px] text-ios-gray">Checked by <span className="font-semibold text-ios-label">{nameOf(open.engineerId)}</span></p>}
            <SubmittedView ins={open} />
          </>
        )}
      </Sheet>
    </>
  );
}

function Ring({ pct, color, track }: { pct: number; color: string; track: string }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <svg width="20" height="20" className="-rotate-90">
      <circle cx="10" cy="10" r={r} stroke={track} strokeWidth="3" fill="none" />
      {pct > 0 && <circle cx="10" cy="10" r={r} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - pct * c} />}
    </svg>
  );
}

function PersonChip({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-14 shrink-0 flex-col items-center gap-1 transition active:scale-95">
      <span className={clsx("rounded-full p-[3px] transition", active ? "bg-ios-blue" : "bg-transparent")}>
        <span className="block rounded-full bg-white p-[2px]">{children}</span>
      </span>
      <span className={clsx("w-full truncate text-center text-[11px] font-semibold", active ? "text-ios-blue" : "text-ios-gray")}>{label}</span>
    </button>
  );
}
