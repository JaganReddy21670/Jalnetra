"use client";

import clsx from "clsx";
import { ChevronRight, Copy, KeyRound, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { api, useApi, useNow, useSession } from "@/components/session";
import { Avatar, Badge, Button, Card, DayBadge, DeviceIcon, Empty, PageHeader, ProgressBar, Segmented, Sheet, Spinner, inputCls } from "@/components/ui";
import { DEADLINE_MIN, DEVICE_TYPES, type Device, type DeviceTypeKey, type Inspection, type PublicUser, type Role } from "@/lib/devices";
import { fmtDate, fmtDateTime, istParts } from "@/lib/format";
import { dayState, dueOn, indexInspections, shiftDate, uptime, uptimeColor, type DayState } from "@/lib/status";

type Tab = "Engineers" | "Administrators";
type Tone = "green" | "orange" | "red" | "gray" | "blue" | "purple";

interface Row {
  u: PublicUser;
  devices: { d: Device; st: DayState | null }[];
  due: number;
  checked: number;
  open: number;
  offline: number;
  pct: number;
  uptime: number | null;
  lastCheck: string | null;
  status: { label: string; tone: Tone };
}

export default function EngineersPage() {
  const { user: me, toast } = useSession();
  const now = useNow(60000);
  const today = now ? istParts(now).date : null;
  const from = today ? shiftDate(today, -29) : null;
  const usersRes = useApi<{ users: PublicUser[]; adminCode: string | null }>("/api/users");
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const insRes = useApi<{ inspections: Inspection[] }>(from ? `/api/inspections?from=${from}&to=${today}` : null);
  const [tab, setTab] = useState<Tab>("Engineers");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tempPw, setTempPw] = useState<{ email: string; pw: string } | null>(null);

  const data = useMemo(() => {
    if (!usersRes.data || !devRes.data || !insRes.data || !now || !today) return null;
    const users = usersRes.data.users;
    const devices = devRes.data.devices.filter((d) => d.active);
    const ins = insRes.data.inspections;
    const idx = indexInspections(ins);
    const afterDeadline = istParts(now).minutes >= DEADLINE_MIN;

    const build = (u: PublicUser): Row => {
      const mine = devices.filter((d) => d.engineerId === u.id).sort((a, b) => a.name.localeCompare(b.name));
      const doneToday = (d: Device) => idx.has(`${d.id}|${today}`);
      const due = mine.filter((d) => dueOn(d, today) || doneToday(d)).length;
      const checked = mine.filter(doneToday).length;
      const open = mine.filter((d) => dueOn(d, today) && !doneToday(d)).length;
      const offline = mine.filter((d) => idx.get(`${d.id}|${today}`)?.answers.dataStatus === "Offline").length;
      const up = mine.map((d) => uptime(d, idx, today));
      const on = up.reduce((a, x) => a + x.online, 0);
      const all = up.reduce((a, x) => a + x.online + x.offline, 0);
      const lastCheck = ins.filter((i) => i.engineerId === u.id).reduce<string | null>((a, i) => (!a || i.submittedAt > a ? i.submittedAt : a), null);
      const status: Row["status"] = !mine.length
        ? { label: "No devices", tone: "gray" }
        : open
          ? afterDeadline
            ? { label: `${open} missed`, tone: "red" }
            : { label: `${open} pending`, tone: "orange" }
          : due
            ? { label: "All checked", tone: "green" }
            : { label: "Due tomorrow", tone: "gray" };
      return {
        u,
        devices: mine.map((d) => ({ d, st: dayState(d, idx.get(`${d.id}|${today}`), today, now) })),
        due,
        checked,
        open,
        offline,
        pct: due ? Math.round((checked / due) * 100) : 0,
        uptime: all ? Math.round((on / all) * 100) : null,
        lastCheck,
        status,
      };
    };

    const engineers = users.filter((u) => u.role === "engineer").map(build).sort((a, b) => a.u.name.localeCompare(b.u.name));
    const admins = users.filter((u) => u.role === "admin").map(build).sort((a, b) => (a.u.id === me?.id ? -1 : b.u.id === me?.id ? 1 : a.u.name.localeCompare(b.u.name)));
    const sum = (k: "due" | "checked" | "open") => engineers.reduce((a, r) => a + r[k], 0);
    return {
      engineers,
      admins,
      afterDeadline,
      totals: { devices: engineers.reduce((a, r) => a + r.devices.length, 0), due: sum("due"), checked: sum("checked"), open: sum("open"), active: engineers.filter((r) => r.devices.length).length },
    };
  }, [usersRes.data, devRes.data, insRes.data, now, today, me?.id]);

  function reload() {
    usersRes.reload();
    devRes.reload();
  }

  async function resetPassword(u: PublicUser) {
    if (!window.confirm(`Reset ${u.name}'s password?\n\nTheir current password will stop working and you'll get a temporary one to give them.`)) return;
    setBusy(true);
    try {
      const r = await api<{ email: string; tempPassword: string }>("POST", `/api/users/${u.id}/password`);
      setTempPw({ email: r.email, pw: r.tempPassword });
      toast("Password reset");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function setRole(u: PublicUser, role: Role) {
    const msg =
      role === "admin"
        ? `Make ${u.name} an Administrator?\n\nThey will see every engineer, device and check, download the Excel workbook and change settings.`
        : `Change ${u.name} to an Engineer?\n\nThey will lose access to the admin pages.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await api("PATCH", `/api/users/${u.id}`, { role });
      toast(`${u.name} is now ${role === "admin" ? "an Administrator" : "an Engineer"}`);
      setOpenId(null);
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleType(u: PublicUser, t: DeviceTypeKey) {
    const cur = u.deviceTypes?.length ? u.deviceTypes : DEVICE_TYPES.map((x) => x.key);
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    if (next.length === 0) return toast("An engineer needs at least one device type", "error");
    try {
      await api<{ user: PublicUser }>("PATCH", `/api/users/${u.id}`, { deviceTypes: next });
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`)).catch(() => undefined);
  }

  const error = usersRes.error || devRes.error || insRes.error;
  if (error) return <Card><Empty title="Couldn't load engineers" text={error} action={<Button variant="secondary" onClick={() => { reload(); insRes.reload(); }}>Try again</Button>} /></Card>;
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>;

  const term = q.trim().toLowerCase();
  const match = (r: Row) => !term || r.u.name.toLowerCase().includes(term) || r.u.email.toLowerCase().includes(term);
  const list = (tab === "Engineers" ? data.engineers : data.admins).filter(match);
  const detail = openId ? [...data.engineers, ...data.admins].find((r) => r.u.id === openId) ?? null : null;
  const t = data.totals;

  return (
    <>
      <PageHeader
        title="Engineers"
        subtitle={`${data.engineers.length} field engineer${data.engineers.length === 1 ? "" : "s"} · ${t.devices} device${t.devices === 1 ? "" : "s"} · checks due by 5:00 PM IST`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Engineers" value={data.engineers.length} sub={`${t.active} with devices`} color="#5856D6" />
        <Stat label="Devices assigned" value={t.devices} sub={`${t.due} due today`} color="#007AFF" />
        <Stat label="Checked today" value={t.checked} sub={t.due ? `${Math.round((t.checked / t.due) * 100)}% of due devices` : "Nothing due yet"} color="#34C759" />
        <Stat label={data.afterDeadline ? "Missed today" : "Still to check"} value={t.open} sub={data.afterDeadline ? "Not checked by 5:00 PM" : "Before 5:00 PM IST"} color={data.afterDeadline ? "#FF3B30" : "#FF9500"} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-[320px]">
          <Segmented value={tab} options={["Engineers", "Administrators"] as const} onChange={(v) => { setTab(v); setQ(""); }} neutral />
        </div>
        <label className="relative flex-1 sm:max-w-sm sm:ml-auto">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-gray" strokeWidth={2.4} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab.toLowerCase()} by name or email`} className={clsx(inputCls, "pl-10")} aria-label="Search" />
        </label>
      </div>

      {tab === "Administrators" && usersRes.data!.adminCode && (
        <Card className="mb-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#7D7AFF] to-[#5856D6] text-white">
            <KeyRound className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <div className="flex-1">
            <p className="text-[15px] font-semibold">Admin access code</p>
            <p className="text-[13px] text-ios-gray">Needed to create a new Administrator account. Share it only with people who should manage JalNetra.</p>
          </div>
          <button
            onClick={() => copy(usersRes.data!.adminCode!, "Code")}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/80 px-4 py-2.5 font-mono text-[20px] font-bold tracking-[0.25em] ring-1 ring-black/[0.06] hover:bg-white"
            title="Copy code"
          >
            {usersRes.data!.adminCode}
            <Copy className="h-4 w-4 text-ios-gray" strokeWidth={2.4} />
          </button>
        </Card>
      )}

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          term ? (
            <Empty title="No matches" text={`Nobody matches "${q.trim()}".`} />
          ) : tab === "Engineers" ? (
            <Empty title="No engineers yet" text="Engineers appear here after they create an account on JalNetra and choose Engineer." />
          ) : (
            <Empty title="No administrators" />
          )
        ) : tab === "Engineers" ? (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_150px_190px_90px_120px_20px] items-center gap-4 border-b border-ios-separator px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.04em] text-ios-gray md:grid">
              <span>Engineer</span>
              <span>Device types</span>
              <span>Today</span>
              <span className="text-right">Uptime 30d</span>
              <span className="text-right">Status</span>
              <span />
            </div>
            <ul className="divide-y divide-ios-separator">
              {list.map((r) => (
                <li key={r.u.id}>
                  <button onClick={() => { setOpenId(r.u.id); setTempPw(null); }} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 text-left transition hover:bg-white/60 md:grid-cols-[minmax(0,1fr)_150px_190px_90px_120px_20px]">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={r.u.name} picture={r.u.picture} size={40} />
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{r.u.name}</p>
                        <p className="truncate text-[13px] text-ios-gray">{r.u.email}</p>
                      </div>
                    </div>
                    <div className="hidden flex-wrap gap-1 md:flex">
                      {typesOf(r).map((x) => (
                        <span key={x.key} className="inline-flex items-center gap-1 rounded-full bg-white/70 py-0.5 pl-0.5 pr-2 text-[12px] font-semibold ring-1 ring-black/[0.04]" title={x.label}>
                          <DeviceIcon type={x.key} size={18} />
                          {x.count}
                        </span>
                      ))}
                      {!r.devices.length && <span className="text-[13px] text-ios-gray">—</span>}
                    </div>
                    <div className="order-last col-span-2 md:order-none md:col-span-1">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="text-ios-gray md:hidden">Today</span>
                        <span className="font-semibold tabular-nums">{r.due ? `${r.checked} of ${r.due} checked` : r.devices.length ? "Not due yet" : "No devices"}</span>
                      </div>
                      <ProgressBar value={r.pct} className="mt-1.5" color={r.open && data.afterDeadline ? "#FF3B30" : undefined} />
                    </div>
                    <div className="hidden text-right text-[14px] font-semibold tabular-nums md:block" style={{ color: uptimeColor(r.uptime) }}>
                      {r.uptime === null ? "—" : `${r.uptime}%`}
                    </div>
                    <div className="text-right">
                      <Badge tone={r.status.tone} dot>{r.status.label}</Badge>
                    </div>
                    <ChevronRight className="hidden h-4 w-4 text-ios-gray/60 md:block" strokeWidth={2.4} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="divide-y divide-ios-separator">
            {list.map((r) => (
              <li key={r.u.id}>
                <button onClick={() => { setOpenId(r.u.id); setTempPw(null); }} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/60">
                  <Avatar name={r.u.name} picture={r.u.picture} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[16px] font-semibold tracking-[-0.01em]">
                      {r.u.name}
                      {r.u.id === me?.id && <Badge tone="blue">You</Badge>}
                    </p>
                    <p className="truncate text-[13px] text-ios-gray">{r.u.email}</p>
                  </div>
                  <span className="hidden text-[13px] text-ios-gray sm:block">Joined {fmtDate(r.u.createdAt)}</span>
                  <Badge tone="purple">
                    <ShieldCheck className="h-3 w-3" strokeWidth={2.6} /> Administrator
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-ios-gray/60" strokeWidth={2.4} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet
        open={!!detail}
        onClose={() => { setOpenId(null); setTempPw(null); }}
        title={detail?.u.name ?? ""}
        footer={
          detail && detail.u.id !== me?.id ? (
            detail.u.role === "engineer" ? (
              <>
                <Button variant="secondary" loading={busy} onClick={() => resetPassword(detail.u)}>Reset Password</Button>
                <Button variant="secondary" loading={busy} onClick={() => setRole(detail.u, "admin")}>Make Administrator</Button>
              </>
            ) : (
              <Button variant="secondary" loading={busy} onClick={() => setRole(detail.u, "engineer")}>Change to Engineer</Button>
            )
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            {tempPw && tempPw.email === detail.u.email && (
              <div className="rounded-2xl bg-ios-green/10 p-4 ring-1 ring-ios-green/25">
                <p className="text-[14px] font-semibold text-[#248A3D]">New temporary password</p>
                <button
                  onClick={() => copy(tempPw.pw, "Password")}
                  className="mt-2 w-full rounded-xl bg-white px-4 py-2.5 text-left font-mono text-[20px] font-bold tracking-[0.12em] ring-1 ring-black/[0.06] hover:bg-white/80"
                  title="Copy"
                >
                  {tempPw.pw}
                </button>
                <p className="mt-2 text-[12px] text-ios-gray">Give this to {detail.u.name.split(" ")[0]} to sign in. It&apos;s shown only once; the old password no longer works.</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Avatar name={detail.u.name} picture={detail.u.picture} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-ios-gray">{detail.u.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={detail.u.role === "admin" ? "purple" : "blue"}>{detail.u.role === "admin" ? "Administrator" : "Engineer"}</Badge>
                  {detail.u.role === "engineer" && <Badge tone={detail.status.tone} dot>{detail.status.label}</Badge>}
                </div>
              </div>
            </div>

            {(detail.u.role === "engineer" || detail.devices.length > 0) && (
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Devices" value={String(detail.devices.length)} />
                <MiniStat label="Checked today" value={detail.due ? `${detail.checked}/${detail.due}` : "—"} />
                <MiniStat label="Uptime 30d" value={detail.uptime === null ? "—" : `${detail.uptime}%`} color={uptimeColor(detail.uptime)} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-white/70 p-4 text-[13px] ring-1 ring-black/[0.05]">
              <Info label="Sign-in" value={detail.u.provider === "google" ? "Google" : "Email & password"} />
              <Info label="Joined" value={fmtDate(detail.u.createdAt)} />
              {detail.u.role === "engineer" && <Info label="Last check" value={detail.lastCheck ? fmtDateTime(detail.lastCheck) : "None in 30 days"} />}
              {detail.u.role === "engineer" && <Info label="Offline today" value={String(detail.offline)} />}
            </div>

            {detail.u.role === "engineer" && (
              <div>
                <p className="section-label px-1">Device access</p>
                <p className="mb-2 px-1 text-[12px] text-ios-gray">This engineer can only add and check the selected device types. Tap to change.</p>
                <div className="flex flex-wrap gap-2">
                  {DEVICE_TYPES.map((x) => {
                    const on = !detail.u.deviceTypes?.length || detail.u.deviceTypes.includes(x.key);
                    return (
                      <button
                        key={x.key}
                        type="button"
                        onClick={() => toggleType(detail.u, x.key)}
                        className={clsx(
                          "inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-semibold transition active:scale-95",
                          on ? "bg-white text-ios-label ring-2 ring-ios-blue" : "bg-white/50 text-ios-gray ring-1 ring-black/[0.06]",
                        )}
                      >
                        <DeviceIcon type={x.key} size={22} className={on ? "" : "opacity-40 grayscale"} />
                        {x.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(detail.u.role === "engineer" || detail.devices.length > 0) && (
              <div>
                <p className="section-label px-1">Devices ({detail.devices.length})</p>
                {detail.devices.length === 0 ? (
                  <p className="px-1 text-[15px] text-ios-gray">No devices assigned yet.</p>
                ) : (
                  <ul className="divide-y divide-ios-separator rounded-2xl bg-white/70 ring-1 ring-black/[0.05]">
                    {detail.devices.map(({ d, st }) => (
                      <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                        <DeviceIcon type={d.type} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold">{d.name}</p>
                          <p className="truncate text-[12px] text-ios-gray">{d.location || d.id}</p>
                        </div>
                        {st && today && !dueOn(d, today) && st === "pending" ? <Badge>From tomorrow</Badge> : st ? <DayBadge state={st} /> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {detail.u.role === "admin" && (
              <p className="px-1 text-[13px] text-ios-gray">
                Administrators see every engineer, device and check, download the Excel workbook and manage settings.
                {detail.u.id === me?.id ? " This is your account." : ""}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

function typesOf(r: Row) {
  return DEVICE_TYPES.map((x) => ({ key: x.key, label: x.label, count: r.devices.filter((v) => v.d.type === x.key).length })).filter((x) => x.count);
}

function Stat({ label, value, sub, color }: { label: string; value: number; sub: string; color: string }) {
  return (
    <Card className="animate-rise p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <p className="text-[13px] font-medium text-ios-gray">{label}</p>
      </div>
      <p className="mt-2 text-[32px] font-bold tabular-nums leading-none tracking-[-0.03em]">{value}</p>
      <p className="mt-2 truncate text-[13px] text-ios-gray">{sub}</p>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-3 text-center ring-1 ring-black/[0.05]">
      <p className="text-[20px] font-bold tabular-nums tracking-[-0.02em]" style={color ? { color } : undefined}>{value}</p>
      <p className="mt-0.5 text-[12px] text-ios-gray">{label}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-ios-gray">{label}</div>
      <div className="truncate font-semibold">{value}</div>
    </div>
  );
}
