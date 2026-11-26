"use client";

import clsx from "clsx";
import { AlertTriangle, ChevronRight, MapPin, Plus, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SubmittedView } from "@/components/InspectionView";
import { api, useApi, useNow, useSession } from "@/components/session";
import { Button, Card, DayBadge, DeviceIcon, Empty, Field, PageHeader, ProgressRing, Sheet, Spinner, Toggle, inputCls, textareaCls } from "@/components/ui";
import { DEADLINE_MIN, DEVICE_TYPES, OFFLINE_REASONS, deviceType, type Device, type Inspection } from "@/lib/devices";
import { fmtDate, fmtTime, istParts } from "@/lib/format";
import { dayState, dueOn } from "@/lib/status";

type Draft = { dataStatus: "" | "Online" | "Offline"; lastDataReceived: string; offlineReason: string; remarks: string; confirmed: boolean };

function istInput(d: Date) {
  const p = istParts(d);
  return `${p.date}T${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}`;
}

export default function ChecklistPage() {
  const { user, toast } = useSession();
  const now = useNow(30000);
  const devRes = useApi<{ devices: Device[] }>("/api/devices");
  const today = now ? istParts(now).date : null;
  const insRes = useApi<{ inspections: Inspection[] }>(today ? `/api/inspections?from=${today}&to=${today}` : null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const devices = useMemo(() => (devRes.data?.devices ?? []).filter((d) => d.active && d.engineerId === user?.id), [devRes.data, user]);
  const insByDev = useMemo(() => new Map((insRes.data?.inspections ?? []).map((i) => [i.deviceId, i])), [insRes.data]);
  const done = devices.filter((d) => insByDev.has(d.id)).length;
  const offlineCount = devices.filter((d) => insByDev.get(d.id)?.answers.dataStatus === "Offline").length;
  const pct = devices.length ? Math.round((done / devices.length) * 100) : 0;
  const late = now ? istParts(now).minutes >= DEADLINE_MIN : false;
  // Devices added after today's deadline are not due until tomorrow, so they are never "late" today.
  const dueUnchecked = today ? devices.filter((d) => !insByDev.has(d.id) && dueOn(d, today)).length : 0;
  const grouped = DEVICE_TYPES.map((t) => ({
    t,
    list: devices.filter((d) => d.type === t.key).sort((a, b) => Number(insByDev.has(a.id)) - Number(insByDev.has(b.id)) || a.name.localeCompare(b.name)),
  })).filter((g) => g.list.length);

  const open = devices.find((d) => d.id === openId) ?? null;
  const submitted = open ? insByDev.get(open.id) : undefined;

  function openDevice(d: Device) {
    setOpenId(d.id);
    setDraft({ dataStatus: "", lastDataReceived: "", offlineReason: "", remarks: "", confirmed: false });
  }

  function setStatus(s: "Online" | "Offline") {
    if (!draft) return;
    // Online: data is arriving now. Offline: engineer must say when it stopped.
    setDraft({ ...draft, dataStatus: s, lastDataReceived: s === "Online" ? istInput(new Date()) : "", offlineReason: s === "Online" ? "" : draft.offlineReason });
  }

  const offline = draft?.dataStatus === "Offline";
  const future = !!draft?.lastDataReceived && Date.parse(`${draft.lastDataReceived}:00+05:30`) > Date.now() + 5 * 60_000;
  const missing = draft
    ? [
        !draft.dataStatus && "Is data coming?",
        (!draft.lastDataReceived || future) && "Last data received",
        offline && !draft.offlineReason && "Offline reason",
        offline && draft.remarks.trim().length < 5 && "What you found / action taken",
        !draft.confirmed && "Confirmation",
      ].filter(Boolean)
    : [];

  async function submit() {
    if (!open || !draft || missing.length) return;
    setBusy(true);
    try {
      await api("POST", "/api/inspections", {
        deviceId: open.id,
        dataStatus: draft.dataStatus,
        lastDataReceived: new Date(`${draft.lastDataReceived}:00+05:30`).toISOString(),
        offlineReason: draft.offlineReason,
        remarks: draft.remarks,
        confirmed: draft.confirmed,
      });
      toast(`${open.name} checked · ${draft.dataStatus}`);
      setOpenId(null);
      insRes.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (devRes.loading || !now) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={`${fmtDate(today)} · check every node before 5:00 PM IST`}
        actions={
          <Link href="/devices">
            <Button variant="secondary"><Plus className="h-4 w-4" strokeWidth={2.6} /> Add device</Button>
          </Link>
        }
      />

      {devices.length === 0 ? (
        <Card>
          <Empty title="No devices yet" text="Add every device you have deployed, with its location, to start your daily checks." action={<Link href="/devices"><Button>Add devices</Button></Link>} />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <Card className="flex animate-rise flex-col items-center p-6 lg:sticky lg:top-24 lg:self-start">
            <ProgressRing value={pct} label={`${done} of ${devices.length} checked`} />
            <div className="mt-5 grid w-full grid-cols-3 gap-2 text-center">
              <Mini label="Online" value={done - offlineCount} color="text-[#248A3D]" />
              <Mini label="Offline" value={offlineCount} color="text-[#D70015]" />
              <Mini label="To check" value={devices.length - done} color="text-[#A05A00]" />
            </div>
            <p className={clsx("mt-4 text-center text-[14px]", pct === 100 ? "text-[#248A3D]" : late && dueUnchecked > 0 ? "text-[#D70015]" : "text-ios-gray")}>
              {pct === 100 ? "All nodes checked for today." : late && dueUnchecked > 0 ? "Deadline passed. Remaining checks will be marked late." : late ? "New devices are due from tomorrow. You can still check them now." : "Tap a node to record whether data is coming."}
            </p>
          </Card>

          <div className="space-y-5">
            {grouped.map(({ t, list }, gi) => (
              <section key={t.key} className="animate-rise" style={{ animationDelay: `${gi * 50}ms` }}>
                <h2 className="section-label mb-2 px-2">{t.label}</h2>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-ios-separator">
                    {list.map((d) => {
                      const ins = insByDev.get(d.id);
                      const st = dayState(d, ins, today!, now);
                      return (
                        <li key={d.id}>
                          <button onClick={() => openDevice(d)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-white/50 active:bg-white/70">
                            <DeviceIcon type={d.type} size={40} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[16px] font-semibold tracking-[-0.01em]">{d.name}</p>
                              <p className="flex items-center gap-1 truncate text-[13px] text-ios-gray">
                                {ins ? (
                                  <>Checked {fmtTime(ins.submittedAt)}{ins.answers.offlineReason ? ` · ${ins.answers.offlineReason}` : ""}</>
                                ) : (
                                  <><MapPin className="h-3 w-3 shrink-0" />{d.location}</>
                                )}
                              </p>
                            </div>
                            {st && <DayBadge state={st} />}
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
        </div>
      )}

      <Sheet
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        footer={
          !submitted && draft ? (
            <div className="w-full">
              {missing.length > 0 && <p className="mb-2 text-center text-[12px] text-ios-gray">Still needed: {missing.join(", ")}</p>}
              <Button size="lg" className="w-full" disabled={missing.length > 0} loading={busy} onClick={submit}>
                Submit Daily Check
              </Button>
            </div>
          ) : undefined
        }
      >
        {open && submitted ? (
          <SubmittedView ins={submitted} />
        ) : open && draft ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <DeviceIcon type={open.type} size={44} />
              <div className="min-w-0 text-[13px] leading-snug text-ios-gray">
                <div className="font-semibold text-ios-label">{deviceType(open.type).label} · {open.id}</div>
                <div className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{open.location}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-ios-fill/70 p-3 text-[12px]">
              <Auto label="Date" value={fmtDate(today)} />
              <Auto label="Time" value={fmtTime(now.toISOString())} />
              <Auto label="Engineer" value={user?.name ?? ""} />
            </div>
            {late && open && today && dueOn(open, today) && (
              <p className="flex items-start gap-2 rounded-2xl bg-ios-orange/12 p-3 text-[13px] text-[#C93400]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> It&apos;s past 5:00 PM IST. This check will be marked late.
              </p>
            )}

            <div>
              <p className="mb-2 text-[15px] font-semibold">Is data coming from this node?<span className="text-ios-red">*</span></p>
              <div className="grid grid-cols-2 gap-3">
                <StatusCard active={draft.dataStatus === "Online"} onClick={() => setStatus("Online")} tone="green" icon={<Wifi className="h-6 w-6" strokeWidth={2.4} />} title="Yes" text="Data is coming" />
                <StatusCard active={draft.dataStatus === "Offline"} onClick={() => setStatus("Offline")} tone="red" icon={<WifiOff className="h-6 w-6" strokeWidth={2.4} />} title="No" text="Node is offline" />
              </div>
            </div>

            {draft.dataStatus && (
              <Field
                label={offline ? "When was data last received?" : "Last data received"}
                required
                error={future ? "Can't be in the future" : undefined}
                hint={offline ? "Check the server / dashboard for the last packet time" : "Set to now. Change it if the latest packet was earlier."}
              >
                <input type="datetime-local" className={inputCls} value={draft.lastDataReceived} max={istInput(new Date())} onChange={(e) => setDraft({ ...draft, lastDataReceived: e.target.value })} />
              </Field>
            )}

            {offline && (
              <div className="animate-rise space-y-4 rounded-[22px] bg-ios-red/[0.06] p-4 ring-1 ring-ios-red/15">
                <div>
                  <p className="mb-2 text-[15px] font-semibold">Why is it offline?<span className="text-ios-red">*</span></p>
                  <div className="flex flex-wrap gap-2">
                    {OFFLINE_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setDraft({ ...draft, offlineReason: r })}
                        className={clsx(
                          "rounded-full px-3.5 py-2 text-[14px] font-semibold transition active:scale-95",
                          draft.offlineReason === r ? "bg-ios-red text-white shadow-[0_4px_12px_rgba(255,59,48,0.3)]" : "bg-white/80 text-ios-label ring-1 ring-black/[0.06] hover:bg-white",
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="What did you find / action taken?" required hint="e.g. Battery at 2.9 V, replaced fuse, informed vendor">
                  <textarea rows={3} className={textareaCls} value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} placeholder="Describe the problem and what you did…" />
                </Field>
              </div>
            )}

            {draft.dataStatus === "Online" && (
              <Field label="Remarks" hint="Optional">
                <textarea rows={2} className={textareaCls} value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} placeholder="Anything worth noting…" />
              </Field>
            )}

            {draft.dataStatus && (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 p-4 ring-1 ring-black/[0.05]">
                <span className="text-[14px] leading-snug">I confirm I checked this node today and the details are accurate.</span>
                <Toggle checked={draft.confirmed} onChange={(v) => setDraft({ ...draft, confirmed: v })} label="Confirm check" />
              </div>
            )}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function StatusCard({ active, onClick, tone, icon, title, text }: { active: boolean; onClick: () => void; tone: "green" | "red"; icon: React.ReactNode; title: string; text: string }) {
  const c = tone === "green" ? { on: "bg-ios-green text-white shadow-[0_8px_20px_rgba(52,199,89,0.35)]", icon: "text-ios-green" } : { on: "bg-ios-red text-white shadow-[0_8px_20px_rgba(255,59,48,0.35)]", icon: "text-ios-red" };
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("flex flex-col items-start gap-2 rounded-[20px] p-4 text-left transition duration-200 active:scale-[0.97]", active ? c.on : "bg-white/80 ring-1 ring-black/[0.06] hover:bg-white")}
    >
      <span className={clsx(active ? "text-white" : c.icon)}>{icon}</span>
      <span className="text-[20px] font-bold leading-none tracking-[-0.02em]">{title}</span>
      <span className={clsx("text-[13px] font-medium", active ? "text-white/90" : "text-ios-gray")}>{text}</span>
    </button>
  );
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl bg-white/60 py-2 ring-1 ring-black/[0.04]">
      <div className={clsx("text-[20px] font-bold tabular-nums", color)}>{value}</div>
      <div className="text-[11px] font-medium text-ios-gray">{label}</div>
    </div>
  );
}

function Auto({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ios-gray">{label}</div>
      <div className="truncate font-semibold text-ios-label">{value}</div>
    </div>
  );
}
