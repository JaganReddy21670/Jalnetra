"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi, useNow } from "@/components/session";
import { Avatar, Badge, Button, Card, CardHeader, DayBadge, DeviceIcon, Empty, PageHeader, ProgressBar, ProgressRing, Spinner, LoadError } from "@/components/ui";
import { DEVICE_TYPES, type Device, type Inspection, type PublicUser } from "@/lib/devices";
import { fmtDate, fmtTime, istParts } from "@/lib/format";
import { dayState, dueOn, indexInspections, shiftDate, uptime, uptimeColor } from "@/lib/status";

export default function OverviewPage() {
  const now = useNow(30000);
  const today = now ? istParts(now).date : null;
  const from = today ? shiftDate(today, -29) : null;
  const usersRes = useApi<{ users: PublicUser[] }>("/api/users");
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const insRes = useApi<{ inspections: Inspection[] }>(from ? `/api/inspections?from=${from}&to=${today}` : null);

  const data = useMemo(() => {
    if (!usersRes.data || !devRes.data || !insRes.data || !now || !today) return null;
    const users = usersRes.data.users;
    const devices = devRes.data.devices.filter((d) => d.active);
    const ins = insRes.data.inspections;
    const idx = indexInspections(ins);
    const states = devices.map((d) => ({ d, st: dayState(d, idx.get(`${d.id}|${today}`), today, now), ins: idx.get(`${d.id}|${today}`) }));
    const checked = states.filter((s) => s.ins).length;
    const issues = states.filter((s) => s.st === "issue").length;
    const dueToday = states.filter((s) => s.ins || dueOn(s.d, today)).length;
    const pending = states.filter((s) => !s.ins && dueOn(s.d, today)).length;
    const engineerIds = new Set(devices.map((d) => d.engineerId));
    const trend = Array.from({ length: 14 }, (_, k) => {
      const date = shiftDate(today, -(13 - k));
      const exist = devices.filter((d) => dueOn(d, date));
      const done = exist.filter((d) => idx.has(`${d.id}|${date}`)).length;
      return { label: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" }), pct: exist.length ? Math.round((done / exist.length) * 100) : null };
    });
    const perEngineer = users
      .filter((u) => engineerIds.has(u.id) || u.role === "engineer")
      .map((u) => {
        const mine = states.filter((s) => s.d.engineerId === u.id);
        const done = mine.filter((s) => s.ins).length;
        return { u, total: mine.length, done, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 };
      })
      .sort((a, b) => a.pct - b.pct);
    const perType = DEVICE_TYPES.map((t) => {
      const list = states.filter((s) => s.d.type === t.key);
      return { t, total: list.length, done: list.filter((s) => s.ins).length, issues: list.filter((s) => s.st === "issue").length };
    }).filter((x) => x.total);
    const rank = (s: string | null) => (s === "issue" ? 0 : s === "missed" ? 1 : 2);
    const attention = states.filter((s) => s.st === "pending" || s.st === "missed" || s.st === "issue").sort((a, b) => rank(a.st) - rank(b.st));
    const recent = ins.filter((i) => i.date === today).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 8);
    const uptimes = devices.map((d) => ({ d, u: uptime(d, idx, today) })).sort((a, b) => (a.u.pct ?? 101) - (b.u.pct ?? 101));
    const tot = uptimes.reduce((a, x) => ({ on: a.on + x.u.online, all: a.all + x.u.online + x.u.offline }), { on: 0, all: 0 });
    const fleetUptime = tot.all ? Math.round((tot.on / tot.all) * 100) : null;
    return { users, engineerCount: users.filter((u) => u.role === "engineer").length, adminCount: users.filter((u) => u.role === "admin").length, devices, checked, issues, pending, engineers: engineerIds.size, dueToday, pct: dueToday ? Math.round((checked / dueToday) * 100) : 0, trend, perEngineer, perType, attention, recent, uptimes, fleetUptime };
  }, [usersRes.data, devRes.data, insRes.data, now, today]);

  const loadErr = usersRes.error || devRes.error || insRes.error;
  if (loadErr) return <LoadError message={loadErr} onRetry={() => { usersRes.reload(); devRes.reload(); insRes.reload(); }} />;
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>;
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "—";
  const devOf = (id: string) => data.devices.find((d) => d.id === id);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`${fmtDate(today)} · live inspection status`}
        actions={
          <a href="/api/export">
            <Button><Download className="h-4 w-4" strokeWidth={2.4} /> Download Excel</Button>
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Active devices" value={data.devices.length} sub={`${data.perType.length} device types`} color="#007AFF" />
        <Stat label="Engineers" value={data.engineerCount} sub={`${data.engineers} with devices · ${data.adminCount} admin${data.adminCount === 1 ? "" : "s"}`} color="#5856D6" />
        <Stat label="Checked today" value={data.checked} sub={`${data.pending} still pending`} color="#34C759" />
        <Stat label="Offline today" value={data.issues} sub="Nodes not sending data" color="#FF3B30" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col items-center p-6">
          <p className="section-label self-start">Today&apos;s completion</p>
          <div className="my-4">
            <ProgressRing value={data.pct} label={`${data.checked} of ${data.dueToday}`} />
          </div>
          <ProgressBar value={data.pct} />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Completion trend" subtitle="Share of devices checked each day · last 14 days" />
          <div className="h-[230px] px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ left: 0, right: 16, top: 10 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#007AFF" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#007AFF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(60,60,67,0.08)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8E8E93" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#8E8E93" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 8px 30px rgba(0,0,0,0.12)", fontSize: 13 }} formatter={(v) => [`${v}%`, "Completed"]} />
                <Area isAnimationActive={false} type="monotone" dataKey="pct" stroke="#007AFF" strokeWidth={2.5} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-flow-row-dense lg:grid-cols-2">
        <Card>
          <CardHeader title="By device type" subtitle="Checked today" />
          {data.perType.length === 0 ? (
            <Empty title="No devices yet" text="Engineers add their devices during onboarding." />
          ) : (
            <ul className="divide-y divide-ios-separator px-2 pb-2">
              {data.perType.map(({ t, total, done, issues }) => (
                <li key={t.key} className="flex items-center gap-3 px-3 py-3">
                  <DeviceIcon type={t.key} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[15px]">
                      <span className="font-semibold">{t.label}</span>
                      <span className="tabular-nums text-ios-gray">{done}/{total}</span>
                    </div>
                    <ProgressBar value={(done / total) * 100} className="mt-1.5" color={t.color} />
                  </div>
                  {issues > 0 && <Badge tone="red">{issues}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Engineers" subtitle="Today's progress" action={<Link href="/engineers" className="text-[15px] text-ios-blue">See All</Link>} />
          {data.perEngineer.length === 0 ? (
            <Empty title="No engineers yet" text="Share the app link. New sign-ups join as engineers." />
          ) : (
            <ul className="divide-y divide-ios-separator px-2 pb-2">
              {data.perEngineer.map(({ u, total, done, pct }) => (
                <li key={u.id} className="flex items-center gap-3 px-3 py-3">
                  <Avatar name={u.name} picture={u.picture} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[15px]">
                      <span className="truncate font-semibold">{u.name}</span>
                      <span className="tabular-nums text-ios-gray">{total ? `${done}/${total}` : "No devices"}</span>
                    </div>
                    <ProgressBar value={pct} className="mt-1.5" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Needs attention" subtitle="Offline nodes and nodes not yet checked" />
          {data.attention.length === 0 ? (
            <Empty title="All clear" text="Every node is checked and online." />
          ) : (
            <ul className="max-h-[360px] divide-y divide-ios-separator overflow-y-auto px-2 pb-2 scrollbar-thin">
              {data.attention.map(({ d, st }) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-3">
                  <DeviceIcon type={d.type} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{d.name}</p>
                    <p className="truncate text-[13px] text-ios-gray">{userName(d.engineerId)}{d.location ? ` · ${d.location}` : ""}</p>
                  </div>
                  {st && <DayBadge state={st} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Uptime · last 30 days"
            subtitle="Share of checked days each device was sending data · lowest first"
            action={<span className="text-[22px] font-bold tabular-nums" style={{ color: uptimeColor(data.fleetUptime) }}>{data.fleetUptime === null ? "—" : `${data.fleetUptime}%`}</span>}
          />
          {data.uptimes.length === 0 ? (
            <Empty title="No devices yet" />
          ) : (
            <ul className="grid gap-x-6 px-2 pb-3 sm:grid-cols-2">
              {data.uptimes.slice(0, 10).map(({ d, u }) => (
                <li key={d.id} className="flex items-center gap-3 border-b border-ios-separator px-3 py-2.5">
                  <DeviceIcon type={d.type} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[14px]">
                      <span className="truncate font-semibold">{d.name}</span>
                      <span className="ml-2 font-semibold tabular-nums" style={{ color: uptimeColor(u.pct) }}>{u.pct === null ? "—" : `${u.pct}%`}</span>
                    </div>
                    <ProgressBar value={u.pct ?? 0} className="mt-1" color={uptimeColor(u.pct)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Today's activity" subtitle="Who checked what, and when" />
          {data.recent.length === 0 ? (
            <Empty title="Nothing yet today" text="Submissions appear here as engineers check devices." />
          ) : (
            <ul className="divide-y divide-ios-separator px-2 pb-2">
              {data.recent.map((i) => {
                const d = devOf(i.deviceId);
                return (
                  <li key={i.id} className="flex items-center gap-3 px-3 py-3">
                    {d && <DeviceIcon type={d.type} size={34} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]"><span className="font-semibold">{userName(i.engineerId)}</span> checked {d?.name ?? i.deviceId}</p>
                      <p className="text-[13px] text-ios-gray">{fmtTime(i.submittedAt)}</p>
                    </div>
                    <DayBadge state={i.answers.condition === "Issue Detected" ? "issue" : i.late ? "late" : "healthy"} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <Card className="animate-rise p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <p className="text-[13px] font-medium text-ios-gray">{label}</p>
      </div>
      <p className="mt-2 text-[32px] font-bold tabular-nums leading-none tracking-[-0.03em] sm:text-[40px]">{value}</p>
      <p className="mt-2 truncate text-[13px] text-ios-gray">{sub}</p>
    </Card>
  );
}
