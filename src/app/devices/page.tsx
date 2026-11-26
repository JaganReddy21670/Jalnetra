"use client";

import clsx from "clsx";
import { MapPin, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { api, useApi, useNow, useSession } from "@/components/session";
import { LocationFields, coordsError, locFromDevice, locToApi } from "@/components/LocationInput";
import { Badge, Button, Card, DeviceIcon, Empty, Field, PageHeader, Sheet, Spinner, inputCls } from "@/components/ui";
import { DEVICE_TYPES, deviceType, type Device, type DeviceTypeKey, type Inspection, type PublicUser } from "@/lib/devices";
import { fmtDate, istParts } from "@/lib/format";
import { indexInspections, shiftDate, uptime, uptimeColor } from "@/lib/status";

type Edit = { id?: string; type: DeviceTypeKey; name: string; location: string; lat: string; lng: string; engineerId: string; active: boolean };

export default function DevicesPage() {
  const { user, toast } = useSession();
  const isAdmin = user?.role === "admin";
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const now = useNow(300000);
  const today = now ? istParts(now).date : null;
  const insRes = useApi<{ inspections: Inspection[] }>(today ? `/api/inspections?from=${shiftDate(today, -29)}&to=${today}` : null);
  const insIdx = useMemo(() => indexInspections(insRes.data?.inspections ?? []), [insRes.data]);
  const usersRes = useApi<{ users: PublicUser[] }>(isAdmin ? "/api/users" : null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [engFilter, setEngFilter] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);

  const users = usersRes.data?.users ?? [];
  // Engineers can only add the device types they were set up for.
  const allowedTypes = isAdmin || !user?.deviceTypes?.length ? DEVICE_TYPES : DEVICE_TYPES.filter((t) => user.deviceTypes!.includes(t.key));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? (id === user?.id ? user?.name : "—");
  const devices = useMemo(
    () =>
      (devRes.data?.devices ?? []).filter(
        (d) =>
          (showRemoved || d.active) &&
          (!typeFilter || d.type === typeFilter) &&
          (!engFilter || d.engineerId === engFilter) &&
          (!q || `${d.name} ${d.location} ${d.id}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [devRes.data, showRemoved, typeFilter, engFilter, q],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    (devRes.data?.devices ?? []).filter((d) => d.active).forEach((d) => m.set(d.type, (m.get(d.type) ?? 0) + 1));
    return m;
  }, [devRes.data]);

  async function save() {
    if (!edit || !edit.name.trim() || !edit.location.trim() || coordsError(edit)) return;
    setBusy(true);
    try {
      if (edit.id) await api("PATCH", `/api/devices/${edit.id}`, { name: edit.name, ...locToApi(edit), ...(isAdmin ? { engineerId: edit.engineerId } : {}) });
      else await api("POST", "/api/devices", { type: edit.type, name: edit.name, ...locToApi(edit), engineerId: isAdmin ? edit.engineerId : undefined });
      toast(edit.id ? "Device updated" : "Device added");
      setEdit(null);
      devRes.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(active: boolean) {
    if (!edit?.id) return;
    setBusy(true);
    try {
      await api("PATCH", `/api/devices/${edit.id}`, { active });
      toast(active ? "Device restored" : "Device removed from daily checks");
      setEdit(null);
      devRes.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (devRes.loading && !devRes.data) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <>
      <PageHeader
        title={isAdmin ? "All Devices" : "My Devices"}
        subtitle={isAdmin ? `${counts.size ? [...counts.values()].reduce((a, b) => a + b, 0) : 0} active devices across ${counts.size} types` : "The devices you check every day"}
        actions={
          <Button onClick={() => setEdit({ type: allowedTypes.some((t) => t.key === typeFilter) ? (typeFilter as DeviceTypeKey) : allowedTypes[0].key, name: "", location: "", lat: "", lng: "", engineerId: user!.id, active: true })}>
            <Plus className="h-4 w-4" strokeWidth={2.6} /> Add Device
          </Button>
        }
      />

      {/* Type chips */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-thin">
        <Chip active={!typeFilter} onClick={() => setTypeFilter("")}>All</Chip>
        {DEVICE_TYPES.filter((t) => counts.has(t.key) || typeFilter === t.key).map((t) => (
          <Chip key={t.key} active={typeFilter === t.key} onClick={() => setTypeFilter(t.key)}>
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.label} <span className="opacity-60">{counts.get(t.key) ?? 0}</span>
          </Chip>
        ))}
      </div>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-gray" />
          <input className={clsx(inputCls, "pl-10")} placeholder="Search devices" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {isAdmin && (
          <select className={clsx(inputCls, "sm:w-56")} value={engFilter} onChange={(e) => setEngFilter(e.target.value)}>
            <option value="">All engineers</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <label className="flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-white/60 px-3.5 text-[14px] ring-1 ring-black/[0.05]">
          <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} className="h-4 w-4 accent-[#007AFF]" />
          Show removed
        </label>
      </div>

      {devices.length === 0 ? (
        <Card>
          <Empty title="No devices" text={q || typeFilter ? "Nothing matches your filters." : "Add every device you have deployed, with its location."} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setEdit({ id: d.id, type: d.type, name: d.name, ...locFromDevice(d), engineerId: d.engineerId, active: d.active })}
              className={clsx("glass group flex animate-rise items-start gap-3.5 rounded-[22px] p-4 text-left transition hover:bg-white/70 active:scale-[0.99]", !d.active && "opacity-55")}
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              <DeviceIcon type={d.type} size={46} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{d.name}</p>
                  {!d.active && <Badge>Removed</Badge>}
                </div>
                <p className="text-[13px] text-ios-gray">{deviceType(d.type).label} · {d.id}</p>
                {d.location && <p className="mt-1 flex items-center gap-1 truncate text-[13px] text-ios-gray"><MapPin className="h-3 w-3 shrink-0" />{d.location}</p>}
                {isAdmin && <p className="mt-1 truncate text-[13px] text-ios-label">{nameOf(d.engineerId)}</p>}
                {today && d.active && insRes.data && <UptimeBar u={uptime(d, insIdx, today)} />}
              </div>
              <Pencil className="mt-1 h-4 w-4 text-black/20 transition group-hover:text-ios-blue" />
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Edit Device" : "New Device"}
        footer={
          edit && (
            <>
              {edit.id && (edit.active ? <Button variant="plain" className="mr-auto text-ios-red hover:bg-ios-red/10" onClick={() => setActive(false)} disabled={busy}>Remove</Button> : <Button variant="plain" className="mr-auto" onClick={() => setActive(true)} disabled={busy}>Restore</Button>)}
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={save} loading={busy} disabled={!edit.name.trim() || !edit.location.trim() || !!coordsError(edit)}>{edit.id ? "Save" : "Add"}</Button>
            </>
          )
        }
      >
        {edit && (
          <div className="space-y-4">
            {!edit.id ? (
              <div>
                <span className="mb-2 block text-[13px] font-medium text-[#3C3C43]">Device type</span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {allowedTypes.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setEdit({ ...edit, type: t.key })}
                      className={clsx("flex flex-col items-center gap-1.5 rounded-2xl p-2.5 text-center text-[11px] font-semibold leading-tight transition", edit.type === t.key ? "bg-white ring-2 ring-ios-blue" : "bg-white/50 hover:bg-white/80")}
                    >
                      <DeviceIcon type={t.key} size={30} />
                      {t.label}
                    </button>
                  ))}
                </div>
                {!isAdmin && allowedTypes.length < DEVICE_TYPES.length && (
                  <p className="mt-2 text-[12px] text-ios-gray">You have access to {allowedTypes.map((t) => t.label).join(", ")}. Ask your administrator for other device types.</p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <DeviceIcon type={edit.type} size={40} />
                <div className="text-[13px] text-ios-gray">{deviceType(edit.type).label} · {edit.id}<br />Added {fmtDate((devRes.data?.devices ?? []).find((d) => d.id === edit.id)?.createdAt)}</div>
              </div>
            )}
            <Field label="Device name" required>
              <input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Hostel Block Tank" autoFocus />
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-[#3C3C43]">
                Deployed location<span className="ml-0.5 text-ios-red">*</span>
              </span>
              <LocationFields value={edit} onChange={(v) => setEdit({ ...edit, ...v })} />
              <span className="mt-1.5 block text-[12px] text-ios-gray">Type latitude and longitude, or tap Auto at the device to fill them from GPS.</span>
            </div>
            {isAdmin && (
              <Field label="Assigned engineer">
                <select className={inputCls} value={edit.engineerId} onChange={(e) => setEdit({ ...edit, engineerId: e.target.value })}>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role === "admin" ? " (admin)" : ""}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-semibold transition",
        active ? "bg-ios-label text-white" : "bg-white/60 text-ios-label ring-1 ring-black/[0.05] backdrop-blur hover:bg-white/90",
      )}
    >
      {children}
    </button>
  );
}

function UptimeBar({ u }: { u: import("@/lib/status").Uptime }) {
  const c = uptimeColor(u.pct);
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-ios-gray">Uptime · 30 days</span>
        <span className="font-semibold tabular-nums" style={{ color: c }}>{u.pct === null ? "No checks yet" : `${u.pct}%`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ios-fill">
        <div className="h-full rounded-full" style={{ width: `${u.pct ?? 0}%`, background: c }} />
      </div>
      {u.pct !== null && (
        <p className="mt-1 text-[11px] text-ios-gray">
          {u.online} online · {u.offline} offline · checked {u.coverage}% of days
        </p>
      )}
    </div>
  );
}
