"use client";

import { KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { api, useApi, useNow, useSession } from "@/components/session";
import { Avatar, Badge, Card, DeviceIcon, PageHeader, ProgressBar, Sheet, Spinner, Button, Empty } from "@/components/ui";
import clsx from "clsx";
import { DEVICE_TYPES, type Device, type DeviceTypeKey, type Inspection, type PublicUser, type Role } from "@/lib/devices";
import { fmtDate, istParts } from "@/lib/format";

export default function EngineersPage() {
  const { user: me, toast } = useSession();
  const now = useNow(60000);
  const today = now ? istParts(now).date : null;
  const usersRes = useApi<{ users: PublicUser[]; adminCode: string | null }>("/api/users");
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const insRes = useApi<{ inspections: Inspection[] }>(today ? `/api/inspections?from=${today}&to=${today}` : null);
  const [open, setOpen] = useState<PublicUser | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const users = usersRes.data?.users ?? [];
    const devices = (devRes.data?.devices ?? []).filter((d) => d.active);
    const done = new Set((insRes.data?.inspections ?? []).map((i) => i.deviceId));
    return users
      .map((u) => {
        const mine = devices.filter((d) => d.engineerId === u.id);
        const checked = mine.filter((d) => done.has(d.id)).length;
        return { u, mine, checked, pct: mine.length ? Math.round((checked / mine.length) * 100) : 0 };
      })
      .sort((a, b) => (a.u.role === b.u.role ? a.u.name.localeCompare(b.u.name) : a.u.role === "admin" ? -1 : 1));
  }, [usersRes.data, devRes.data, insRes.data]);

  async function setRole(u: PublicUser, role: Role) {
    setBusy(true);
    try {
      await api("PATCH", `/api/users/${u.id}`, { role });
      toast(`${u.name} is now ${role === "admin" ? "an Administrator" : "an Engineer"}`);
      setOpen(null);
      usersRes.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleType(u: PublicUser, t: DeviceTypeKey) {
    const cur = u.deviceTypes ?? [];
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    if (next.length === 0) return toast("An engineer needs at least one device type", "error");
    try {
      const r = await api<{ user: PublicUser }>("PATCH", `/api/users/${u.id}`, { deviceTypes: next });
      setOpen(r.user);
      usersRes.reload();
      devRes.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  if (!usersRes.data || !devRes.data) return <div className="flex justify-center py-24"><Spinner /></div>;
  const detail = open ? rows.find((r) => r.u.id === open.id) : null;

  return (
    <>
      <PageHeader title="Engineers" subtitle={`${rows.filter((r) => r.u.role === "engineer").length} engineers · ${rows.filter((r) => r.u.role === "admin").length} administrator(s)`} />
      {usersRes.data.adminCode && (
        <Card className="mb-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#7D7AFF] to-[#5856D6] text-white">
            <KeyRound className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <div className="flex-1">
            <p className="text-[15px] font-semibold">Admin access code</p>
            <p className="text-[13px] text-ios-gray">Share this only with people who should become Administrators. They enter it when creating an Administrator account.</p>
          </div>
          <button
            onClick={() => { navigator.clipboard?.writeText(usersRes.data!.adminCode!).then(() => toast("Code copied")).catch(() => undefined); }}
            className="rounded-2xl bg-white/80 px-4 py-2.5 font-mono text-[20px] font-bold tracking-[0.25em] ring-1 ring-black/[0.06] hover:bg-white"
            title="Copy"
          >
            {usersRes.data.adminCode}
          </button>
        </Card>
      )}
      {rows.length === 0 ? (
        <Card><Empty title="No users yet" /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ u, mine, checked, pct }, i) => (
            <button key={u.id} onClick={() => setOpen(u)} className="glass flex animate-rise flex-col rounded-[24px] p-5 text-left transition hover:bg-white/70 active:scale-[0.99]" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="flex items-center gap-3">
                <Avatar name={u.name} picture={u.picture} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold tracking-[-0.01em]">{u.name}</p>
                  <p className="truncate text-[13px] text-ios-gray">{u.email}</p>
                </div>
                <Badge tone={u.role === "admin" ? "purple" : "blue"}>{u.role === "admin" ? "Admin" : "Engineer"}</Badge>
              </div>
              <div className="mt-4 flex items-center justify-between text-[13px]">
                <span className="text-ios-gray">Today</span>
                <span className="font-semibold tabular-nums">{mine.length ? `${checked} of ${mine.length} checked` : "No devices"}</span>
              </div>
              <ProgressBar value={pct} className="mt-1.5" />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {DEVICE_TYPES.filter((t) => mine.some((d) => d.type === t.key)).map((t) => (
                  <span key={t.key} className="inline-flex items-center gap-1.5 rounded-full bg-white/70 py-1 pl-1 pr-2.5 text-[12px] font-semibold ring-1 ring-black/[0.04]">
                    <DeviceIcon type={t.key} size={20} />
                    {mine.filter((d) => d.type === t.key).length}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!detail}
        onClose={() => setOpen(null)}
        title={detail?.u.name ?? ""}
        footer={
          detail && detail.u.id !== me?.id ? (
            detail.u.role === "engineer" ? (
              <Button variant="secondary" loading={busy} onClick={() => setRole(detail.u, "admin")}>Make Administrator</Button>
            ) : (
              <Button variant="secondary" loading={busy} onClick={() => setRole(detail.u, "engineer")}>Change to Engineer</Button>
            )
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/70 p-4 text-[13px] ring-1 ring-black/[0.05]">
              <div><div className="text-ios-gray">Email</div><div className="truncate font-semibold">{detail.u.email}</div></div>
              <div><div className="text-ios-gray">Sign-in</div><div className="font-semibold">{detail.u.provider === "google" ? "Google" : "Email & password"}</div></div>
              <div><div className="text-ios-gray">Role</div><div className="font-semibold">{detail.u.role === "admin" ? "Administrator" : "Engineer"}</div></div>
              <div><div className="text-ios-gray">Joined</div><div className="font-semibold">{fmtDate(detail.u.createdAt)}</div></div>
            </div>
            {detail.u.role === "engineer" && (
              <div>
                <p className="section-label px-1">Device access</p>
                <p className="mb-2 px-1 text-[12px] text-ios-gray">This engineer can only add and check the selected device types.</p>
                <div className="flex flex-wrap gap-2">
                  {DEVICE_TYPES.map((t) => {
                    const on = !detail.u.deviceTypes?.length || detail.u.deviceTypes.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => toggleType({ ...detail.u, deviceTypes: detail.u.deviceTypes?.length ? detail.u.deviceTypes : DEVICE_TYPES.map((x) => x.key) }, t.key)}
                        className={clsx(
                          "inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-semibold transition active:scale-95",
                          on ? "bg-white text-ios-label ring-2 ring-ios-blue" : "bg-white/50 text-ios-gray ring-1 ring-black/[0.06]",
                        )}
                      >
                        <DeviceIcon type={t.key} size={22} className={on ? "" : "opacity-40 grayscale"} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <p className="section-label px-1">Devices ({detail.mine.length})</p>
            {detail.mine.length === 0 ? (
              <p className="px-1 text-[15px] text-ios-gray">No devices assigned.</p>
            ) : (
              <ul className="divide-y divide-ios-separator rounded-2xl bg-white/70 ring-1 ring-black/[0.05]">
                {detail.mine.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <DeviceIcon type={d.type} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{d.name}</p>
                      <p className="truncate text-[12px] text-ios-gray">{d.location || d.id}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
