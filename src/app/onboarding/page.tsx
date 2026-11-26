"use client";

import clsx from "clsx";
import { Check, ChevronLeft, ClipboardCheck, Clock, FileSpreadsheet, MessageSquareWarning, Plus, ShieldCheck, Trash2, Users, Cpu } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useSession } from "@/components/session";
import { LocationFields, coordsError, locToApi } from "@/components/LocationInput";
import { Button, DeviceIcon, inputCls } from "@/components/ui";
import { DEVICE_TYPES, deviceType, type DeviceTypeKey, type PublicUser } from "@/lib/devices";
import { APP_NAME } from "@/lib/brand";

const ENGINEER_STEPS = [
  { icon: Cpu, text: "Add every device you have deployed, with its location. You can edit this list any time." },
  { icon: ClipboardCheck, text: "Every day, open each node and record whether data is coming from it." },
  { icon: MessageSquareWarning, text: "If a node is offline, pick the reason and note what you found or did." },
  { icon: Clock, text: "Finish all checks before 5:00 PM IST. Later checks are marked late." },
  { icon: ShieldCheck, text: "Everything is saved instantly and shared with your administrator." },
];

const ADMIN_STEPS = [
  { icon: Users, text: "You can see every engineer, device and daily inspection." },
  { icon: Clock, text: "Overview shows today's progress live against the 5:00 PM IST deadline." },
  { icon: FileSpreadsheet, text: "Download the Excel workbook: one sub-sheet per device type, admin-only." },
  { icon: ShieldCheck, text: "Manage roles and reassign devices from Engineers and Devices." },
];

type Row = { key: number; name: string; location: string; lat: string; lng: string };

export default function OnboardingPage() {
  const { user, setUser, toast } = useSession();
  const router = useRouter();
  const isAdmin = user?.role === "admin";
  const [step, setStep] = useState(0);
  const [types, setTypes] = useState<DeviceTypeKey[]>([]);
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const totalSteps = isAdmin ? 1 : 3;

  const allRows = useMemo(() => types.flatMap((t) => (rows[t] ?? []).map((r) => ({ ...r, type: t }))), [types, rows]);
  const dupNames = useMemo(() => {
    const seen = new Map<string, number>();
    allRows.forEach((r) => r.name.trim() && seen.set(r.name.trim().toLowerCase(), (seen.get(r.name.trim().toLowerCase()) ?? 0) + 1));
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [allRows]);
  const namesValid = allRows.length > 0 && allRows.every((r) => r.name.trim() && r.location.trim() && !coordsError(r)) && dupNames.size === 0;

  if (!user) return null;

  function toggleType(t: DeviceTypeKey) {
    setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
    setRows((r) => (r[t] ? r : { ...r, [t]: [{ key: Date.now(), name: "", location: "", lat: "", lng: "" }] }));
  }
  const updateRow = (t: string, key: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [t]: r[t].map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const addRow = (t: string) => setRows((r) => ({ ...r, [t]: [...(r[t] ?? []), { key: Date.now(), name: "", location: "", lat: "", lng: "" }] }));
  const removeRow = (t: string, key: number) => setRows((r) => ({ ...r, [t]: r[t].filter((x) => x.key !== key) }));

  async function finish() {
    setTried(true);
    if (!isAdmin && !namesValid) return;
    setBusy(true);
    try {
      const r = await api<{ user: PublicUser }>("POST", "/api/onboarding", {
        devices: isAdmin ? [] : allRows.map((r) => ({ type: r.type, name: r.name.trim(), ...locToApi(r) })),
      });
      setUser(r.user);
      toast(isAdmin ? "Welcome, Administrator" : `${allRows.length} device${allRows.length > 1 ? "s" : ""} added`);
      router.replace(isAdmin ? "/" : "/checklist");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-32 pt-8 sm:pt-14">
      {/* Progress */}
      <div className="mb-8 flex items-center gap-3">
        {step > 0 ? (
          <button onClick={() => setStep((s) => s - 1)} className="flex items-center text-[17px] text-ios-blue">
            <ChevronLeft className="h-5 w-5" /> Back
          </button>
        ) : (
          <span className="w-16" />
        )}
        <div className="mx-auto flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} className={clsx("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-ios-blue" : i < step ? "w-1.5 bg-ios-blue/60" : "w-1.5 bg-black/15")} />
          ))}
        </div>
        <span className="w-16 text-right text-[13px] text-ios-gray">
          {step + 1} of {totalSteps}
        </span>
      </div>

      {step === 0 && (
        <section key="s0" className="animate-rise">
          <p className="section-label">Welcome, {user.name.split(" ")[0]}</p>
          <h1 className="large-title mt-1">{isAdmin ? "You're the Administrator" : `How ${APP_NAME} works`}</h1>
          <div className="glass-strong mt-8 rounded-[28px] p-2">
            <ul className="divide-y divide-ios-separator">
              {(isAdmin ? ADMIN_STEPS : ENGINEER_STEPS).map((s, i) => (
                <li key={i} className="flex items-center gap-4 px-4 py-4 animate-rise" style={{ animationDelay: `${80 + i * 60}ms` }}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-ios-blue/10 text-ios-blue">
                    <s.icon className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                  <p className="text-[16px] leading-snug text-ios-label">{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {step === 1 && (
        <section key="s1" className="animate-rise">
          <p className="section-label">Step 2</p>
          <h1 className="large-title mt-1">Which devices do you check?</h1>
          <p className="mt-2 text-[17px] text-ios-gray">Select every type you're responsible for. You'll name them next.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {DEVICE_TYPES.map((t, i) => {
              const on = types.includes(t.key);
              return (
                <button
                  key={t.key}
                  onClick={() => toggleType(t.key)}
                  className={clsx(
                    "relative flex animate-rise flex-col items-start gap-3 rounded-[22px] p-4 text-left transition duration-200 active:scale-[0.98]",
                    on ? "glass-strong ring-2 ring-ios-blue" : "glass hover:bg-white/70",
                  )}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <DeviceIcon type={t.key} size={44} />
                  <div>
                    <div className="text-[16px] font-semibold tracking-[-0.01em]">{t.label}</div>
                    <div className="mt-0.5 text-[13px] leading-snug text-ios-gray">{t.hint}</div>
                  </div>
                  <span
                    className={clsx(
                      "absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full transition",
                      on ? "bg-ios-blue text-white" : "ring-[1.5px] ring-inset ring-black/20",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step === 2 && (
        <section key="s2" className="animate-rise">
          <p className="section-label">Step 3</p>
          <h1 className="large-title mt-1">Add your deployed devices</h1>
          <p className="mt-2 text-[17px] text-ios-gray">Add every device you&apos;ve deployed, with its name and location. Tap Auto at the device to fill latitude and longitude from GPS, or type them in. These are the nodes you&apos;ll check daily.</p>
          <div className="mt-8 space-y-4">
            {types.map((t) => (
              <div key={t} className="glass-strong rounded-[24px] p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-3">
                  <DeviceIcon type={t} size={32} />
                  <h2 className="text-[17px] font-semibold">{deviceType(t).label}</h2>
                  <span className="ml-auto text-[13px] text-ios-gray">{rows[t]?.length ?? 0}</span>
                </div>
                <div className="space-y-2">
                  {(rows[t] ?? []).map((r, idx) => {
                    const bad = tried && (!r.name.trim() || dupNames.has(r.name.trim().toLowerCase()));
                    const badLoc = tried && !r.location.trim();
                    return (
                      <div key={r.key} className="space-y-2 rounded-2xl bg-white/50 p-3 ring-1 ring-black/[0.04]">
                        <div className="flex gap-2">
                          <input
                            className={clsx(inputCls, bad && "ring-2 ring-ios-red/60")}
                            placeholder={`${deviceType(t).label} ${idx + 1} name, e.g. Hostel Block Tank *`}
                            value={r.name}
                            onChange={(e) => updateRow(t, r.key, { name: e.target.value })}
                            autoFocus={idx === 0 && t === types[0]}
                          />
                          {(rows[t]?.length ?? 0) > 1 && (
                            <button onClick={() => removeRow(t, r.key)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ios-red hover:bg-ios-red/10" aria-label="Remove">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <LocationFields
                          value={{ location: r.location, lat: r.lat, lng: r.lng }}
                          onChange={(v) => updateRow(t, r.key, v)}
                          invalidLocation={badLoc}
                        />
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => addRow(t)} className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-ios-blue">
                  <Plus className="h-4 w-4" strokeWidth={2.6} /> Add another {deviceType(t).label}
                </button>
              </div>
            ))}
          </div>
          {tried && !namesValid && <p className="mt-4 text-[13px] font-medium text-ios-red">{dupNames.size ? "Each device needs a unique name." : "Every device needs a name and a deployed location."}</p>}
        </section>
      )}

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-5 pt-3">
        <div className="glass-strong mx-auto flex max-w-3xl items-center gap-3 rounded-[24px] p-3 pl-5">
          <span className="text-[13px] text-ios-gray">
            {step === 1 ? (types.length ? `${types.length} type${types.length > 1 ? "s" : ""} selected` : "Select at least one") : step === 2 ? `${allRows.length} device${allRows.length !== 1 ? "s" : ""}` : "Takes less than a minute"}
          </span>
          <Button
            size="lg"
            className="ml-auto min-w-[150px]"
            loading={busy}
            disabled={step === 1 && types.length === 0}
            onClick={() => (isAdmin || step === 2 ? finish() : setStep((s) => s + 1))}
          >
            {isAdmin ? "Get Started" : step === 2 ? "Finish" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
