"use client";

import clsx from "clsx";
import { Download, FileSpreadsheet, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { useApi, useNow } from "@/components/session";
import { Button, Card, DeviceIcon, Empty, PageHeader, Spinner, LoadError } from "@/components/ui";
import { DEVICE_TYPES, type Device, type Inspection, type PublicUser } from "@/lib/devices";
import { fmtDate, istParts } from "@/lib/format";
import { APP_SLUG } from "@/lib/brand";
import { dayState, indexInspections, shiftDate, type DayState } from "@/lib/status";

const CELL: Record<DayState, { t: string; cls: string }> = {
  healthy: { t: "✓", cls: "bg-ios-green/20 text-[#248A3D]" },
  issue: { t: "!", cls: "bg-ios-red/15 text-[#D70015]" },
  late: { t: "L", cls: "bg-ios-orange/20 text-[#C93400]" },
  missed: { t: "✗", cls: "bg-black/[0.05] text-ios-gray" },
  pending: { t: "…", cls: "bg-ios-yellow/30 text-[#A05A00]" },
};

/** Admin-only: preview of the workbook (one sub-sheet per device type) + download. */
export default function ExcelPage() {
  const now = useNow(60000);
  const today = now ? istParts(now).date : null;
  const days = 7;
  const usersRes = useApi<{ users: PublicUser[] }>("/api/users");
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const insRes = useApi<{ inspections: Inspection[] }>("/api/inspections");
  const [sheet, setSheet] = useState<string>(DEVICE_TYPES[0].key);

  const ready = usersRes.data && devRes.data && insRes.data && now && today;
  const dates = today ? Array.from({ length: days }, (_, k) => shiftDate(today, -(days - 1 - k))) : [];
  const idx = useMemo(() => indexInspections(insRes.data?.inspections ?? []), [insRes.data]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    (devRes.data?.devices ?? []).forEach((d) => m.set(d.type, (m.get(d.type) ?? 0) + 1));
    return m;
  }, [devRes.data]);

  const loadErr = usersRes.error || devRes.error || insRes.error;
  if (loadErr) return <LoadError message={loadErr} onRetry={() => { usersRes.reload(); devRes.reload(); insRes.reload(); }} />;
  if (!ready) return <div className="flex justify-center py-24"><Spinner /></div>;
  const list = devRes.data!.devices.filter((d) => d.type === sheet).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const nameOf = (id: string) => usersRes.data!.users.find((u) => u.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Excel Workbook"
        subtitle="One file · one sub-sheet per device type · administrators only"
        actions={
          <a href="/api/export">
            <Button size="lg"><Download className="h-4 w-4" strokeWidth={2.4} /> Download .xlsx</Button>
          </a>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Info icon={<FileSpreadsheet className="h-5 w-5" />} title={`${DEVICE_TYPES.length + 3} sheets`} text="Summary, one per device type, Inspection Log, Engineers." />
        <Info icon={<Lock className="h-5 w-5" />} title="Admin-only" text="Engineers can't download or see the workbook." />
        <Info icon={<Download className="h-5 w-5" />} title="Always current" text={`Also auto-saved on the server at data/${APP_SLUG}-Devices.xlsx after every change.`} />
      </div>

      <Card className="overflow-hidden">
        {/* Sheet tabs, like Excel */}
        <div className="flex gap-1 overflow-x-auto border-b border-ios-separator bg-white/40 px-3 pt-3 scrollbar-thin">
          {DEVICE_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setSheet(t.key)}
              className={clsx(
                "flex shrink-0 items-center gap-2 rounded-t-xl px-3.5 py-2 text-[13px] font-semibold transition",
                sheet === t.key ? "bg-white text-ios-label shadow-[0_-1px_0_rgba(0,0,0,0.04)]" : "text-ios-gray hover:bg-white/50",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
              {t.sheet}
              <span className="text-ios-gray">{counts.get(t.key) ?? 0}</span>
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <Empty title={`No ${DEVICE_TYPES.find((t) => t.key === sheet)?.label} devices`} text="This sheet will fill in as engineers add devices of this type." />
        ) : (
          <div className="overflow-x-auto bg-white/60 scrollbar-thin">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ios-gray">
                  <th className="px-4 py-3 font-semibold">Device</th>
                  <th className="px-3 py-3 font-semibold">Location</th>
                  <th className="px-3 py-3 font-semibold">Engineer</th>
                  {dates.map((d) => (
                    <th key={d} className="w-10 px-1 py-3 text-center font-semibold">{d.slice(8)}/{d.slice(5, 7)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ios-separator">
                {list.map((d) => (
                  <tr key={d.id} className={clsx(!d.active && "opacity-50")}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <DeviceIcon type={d.type} size={26} />
                        <div>
                          <div className="font-semibold">{d.name}</div>
                          <div className="text-[11px] text-ios-gray">{d.id}{!d.active && " · removed"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-ios-gray">{d.location || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{nameOf(d.engineerId)}</td>
                    {dates.map((date) => {
                      const st = dayState(d, idx.get(`${d.id}|${date}`), date, now!);
                      return (
                        <td key={date} className="px-1 py-2.5 text-center">
                          {st && <span className={clsx("inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold", CELL[st].cls)}>{CELL[st].t}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-ios-separator bg-white/40 px-4 py-3 text-[12px] text-ios-gray">
          {(Object.keys(CELL) as DayState[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={clsx("inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold", CELL[k].cls)}>{CELL[k].t}</span>
              {{ healthy: "Online", issue: "Offline", late: "Late", missed: "Not checked", pending: "Today, pending" }[k]}
            </span>
          ))}
          <span className="ml-auto">Preview shows the last {days} days · the workbook has 31 · as of {fmtDate(today)}</span>
        </div>
      </Card>
    </>
  );
}

function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#1D6F42] text-white">{icon}</span>
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="text-[13px] leading-snug text-ios-gray">{text}</p>
      </div>
    </Card>
  );
}
