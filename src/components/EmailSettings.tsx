"use client";

import clsx from "clsx";
import { Bell, CheckCircle2, ExternalLink, Eye, Mail, Send } from "lucide-react";
import { useState } from "react";
import { api, useSession } from "./session";
import { Badge, Button, Card, CardHeader, Field, Segmented, Toggle, inputCls, textareaCls } from "./ui";

export type EmailS = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passSet: boolean;
  from: string;
  recipients: string[];
  weekly: { enabled: boolean; day: number; time: string };
  lastWeeklySent?: string;
};
export type AlertsS = { reminder: boolean; deadline: boolean; extra: string[] };

const PROVIDERS = {
  Gmail: { host: "smtp.gmail.com", port: 465, secure: true },
  Outlook: { host: "smtp.office365.com", port: 587, secure: false },
  Other: null,
} as const;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Shared by every email JalNetra sends: reminders, deadline alerts, weekly summary. */
export function EmailAccountCard({ email, onSaved }: { email: EmailS; onSaved: () => void }) {
  const { toast } = useSession();
  const [e, setE] = useState(email);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const provider = (Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).find((k) => PROVIDERS[k]?.host === e.host) ?? "Other";
  const ready = email.passSet && !!email.user;
  const dirty = pass !== "" || e.user !== email.user || e.host !== email.host || e.port !== email.port || e.from !== email.from;

  async function save() {
    setBusy("save");
    try {
      await api("PATCH", "/api/settings", { email: { ...email, host: e.host, port: e.port, secure: e.secure, user: e.user, from: e.from, pass } });
      setPass("");
      toast("Email account saved");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const r = await api<{ to: string }>("POST", "/api/settings/test-email");
      toast(`Test email sent to ${r.to}`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Email account"
        subtitle="The address JalNetra sends reminders, alerts and summaries from"
        action={<Badge tone={ready ? "green" : "orange"} dot>{ready ? "Connected" : "Not set up"}</Badge>}
      />
      <div className="space-y-4 px-5 pb-5 sm:px-6">
        {!ready && (
          <ol className="space-y-1.5 rounded-2xl bg-ios-blue/[0.07] p-4 text-[13px] leading-relaxed text-ios-label">
            <li>1. Use a Gmail address (a dedicated one like <i>jalnetra.alerts@gmail.com</i> is best).</li>
            <li>
              2. Turn on 2-Step Verification for it, then create an{" "}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-ios-blue hover:underline">
                App Password <ExternalLink className="h-3 w-3" />
              </a>{" "}
              (16 letters).
            </li>
            <li>3. Enter the address and the App Password below, tap Save, then Send test email.</li>
          </ol>
        )}
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-[#3C3C43]">Provider</span>
          <Segmented
            value={provider}
            options={["Gmail", "Outlook", "Other"] as const}
            neutral
            onChange={(k) => {
              const pr = PROVIDERS[k];
              setE(pr ? { ...e, ...pr } : { ...e, host: "", port: 587, secure: false });
            }}
          />
        </div>
        {provider === "Other" && (
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <Field label="SMTP server">
              <input className={inputCls} value={e.host} onChange={(ev) => setE({ ...e, host: ev.target.value })} placeholder="smtp.example.com" />
            </Field>
            <Field label="Port">
              <input className={inputCls} type="number" value={e.port} onChange={(ev) => setE({ ...e, port: Number(ev.target.value), secure: Number(ev.target.value) === 465 })} />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address">
            <input className={inputCls} type="email" value={e.user} onChange={(ev) => setE({ ...e, user: ev.target.value })} placeholder="jalnetra.alerts@gmail.com" autoComplete="off" />
          </Field>
          <Field label={provider === "Gmail" ? "Gmail App Password" : "Password"} hint={email.passSet ? "Saved. Leave empty to keep it." : undefined}>
            <input
              className={clsx(inputCls, "font-mono")}
              type="password"
              value={pass}
              onChange={(ev) => setPass(ev.target.value)}
              placeholder={email.passSet ? "••••••••••••" : "xxxx xxxx xxxx xxxx"}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <Field label="Sender name" hint="Optional. Shown as the 'From' name, e.g. JalNetra Alerts">
          <input className={inputCls} value={e.from} onChange={(ev) => setE({ ...e, from: ev.target.value })} placeholder="JalNetra" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-ios-separator px-5 py-4 sm:px-6">
        <Button loading={busy === "save"} disabled={!!busy || !dirty || !e.user.trim()} onClick={save}>
          Save
        </Button>
        <Button variant="secondary" loading={busy === "test"} disabled={!!busy || !ready} onClick={test}>
          <Send className="h-4 w-4" /> Send test email
        </Button>
        <span className="ml-auto text-[12px] text-ios-gray">The password is stored only on the server.</span>
      </div>
    </Card>
  );
}

/** 4 PM reminder + 5 PM missed/escalation switches. */
export function AlertsCard({ alerts, emailReady, onSaved }: { alerts: AlertsS; emailReady: boolean; onSaved: () => void }) {
  const { toast } = useSession();
  const [a, setA] = useState(alerts);
  const [extra, setExtra] = useState(alerts.extra.join(", "));
  const [busy, setBusy] = useState(false);
  const dirty = a.reminder !== alerts.reminder || a.deadline !== alerts.deadline || extra !== alerts.extra.join(", ");

  async function save() {
    setBusy(true);
    try {
      await api("PATCH", "/api/settings", { alerts: { ...a, extra } });
      toast("Notification settings saved");
      onSaved();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ icon, title, text, checked, onChange }: { icon: React.ReactNode; title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-black/[0.05]">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-ios-blue/10 text-ios-blue">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="text-[13px] leading-snug text-ios-gray">{text}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Notifications"
        subtitle="Automatic alerts when daily checks are not done (IST)"
        action={<Badge tone={a.reminder || a.deadline ? "green" : "gray"} dot>{a.reminder || a.deadline ? "On" : "Off"}</Badge>}
      />
      <div className="space-y-3 px-5 pb-5 sm:px-6">
        <Row icon={<Bell className="h-[18px] w-[18px]" />} title="4:00 PM reminder" text="Each engineer with unchecked nodes gets a reminder and the list." checked={a.reminder} onChange={(v) => setA({ ...a, reminder: v })} />
        <Row
          icon={<Mail className="h-[18px] w-[18px]" />}
          title="5:00 PM deadline alert"
          text="Engineers who missed nodes are told; all Administrators get an escalation with who missed what."
          checked={a.deadline}
          onChange={(v) => setA({ ...a, deadline: v })}
        />
        <Field label="Also send the 5 PM escalation to" hint="Optional, comma-separated, e.g. a manager. Administrators always receive it.">
          <textarea rows={2} className={textareaCls} value={extra} onChange={(ev) => setExtra(ev.target.value)} placeholder="manager@org.in" />
        </Field>
        <p className={clsx("flex items-start gap-2 rounded-xl px-3 py-2 text-[13px]", emailReady ? "bg-ios-green/10 text-[#248A3D]" : "bg-ios-orange/12 text-[#C93400]")}>
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {emailReady
            ? "Alerts go out by email and appear under the bell in the app."
            : "Alerts appear under the bell in the app now. Set up the email account above to also send them by email."}
        </p>
      </div>
      <div className="flex items-center gap-2 border-t border-ios-separator px-5 py-4 sm:px-6">
        <Button loading={busy} disabled={busy || !dirty} onClick={save}>
          Save
        </Button>
        <span className="ml-auto text-[12px] text-ios-gray">Nobody who has checked everything is notified.</span>
      </div>
    </Card>
  );
}

/** Weekly summary schedule and recipients (uses the email account above). */
export function WeeklySummaryCard({ email, onSaved }: { email: EmailS; onSaved: () => void }) {
  const { toast } = useSession();
  const [w, setW] = useState(email.weekly);
  const [recipients, setRecipients] = useState(email.recipients.join(", "));
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const ready = email.passSet && !!email.user;
  const dirty = JSON.stringify(w) !== JSON.stringify(email.weekly) || recipients !== email.recipients.join(", ");

  async function save(silent = false) {
    setBusy("save");
    try {
      await api("PATCH", "/api/settings", { email: { ...email, pass: "", weekly: w, recipients } });
      if (!silent) toast("Weekly summary saved");
      onSaved();
      return true;
    } catch (err) {
      toast((err as Error).message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sendNow() {
    if (dirty && !(await save(true))) return;
    setBusy("send");
    try {
      const r = await api<{ accepted: string[] }>("POST", "/api/settings/email");
      toast(`Weekly summary sent to ${r.accepted.length} recipient(s)`);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Weekly summary"
        subtitle="Last 7 days of checks, uptime and offline reasons, with the Excel attached"
        action={<Badge tone={w.enabled ? "green" : "gray"} dot>{w.enabled ? "Scheduled" : "Off"}</Badge>}
      />
      <div className="space-y-4 px-5 pb-5 sm:px-6">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 p-4 ring-1 ring-black/[0.05]">
          <div>
            <p className="text-[15px] font-semibold">Send every week</p>
            <p className="text-[13px] text-ios-gray">
              {DAYS[w.day]} around 9:00 AM IST{email.lastWeeklySent ? ` · last sent ${email.lastWeeklySent}` : ""}
            </p>
          </div>
          <Toggle checked={w.enabled} onChange={(v) => setW({ ...w, enabled: v })} label="Weekly email" />
        </div>
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => setW({ ...w, day: i })}
              className={clsx("h-10 flex-1 rounded-xl text-[13px] font-semibold transition", w.day === i ? "bg-ios-blue text-white" : "bg-white/70 ring-1 ring-black/[0.06] hover:bg-white")}
            >
              {d}
            </button>
          ))}
        </div>
        <Field label="Send to" hint="Separate several emails with commas">
          <textarea rows={2} className={textareaCls} value={recipients} onChange={(ev) => setRecipients(ev.target.value)} placeholder="manager@org.in, team@org.in" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-ios-separator px-5 py-4 sm:px-6">
        <Button loading={busy === "save"} disabled={!!busy || !dirty} onClick={() => save()}>
          Save
        </Button>
        <Button variant="secondary" loading={busy === "send"} disabled={!!busy || !ready} onClick={sendNow}>
          <Send className="h-4 w-4" /> Send Now
        </Button>
        <a href="/api/settings/email" target="_blank" rel="noreferrer">
          <Button variant="plain">
            <Eye className="h-4 w-4" /> Preview
          </Button>
        </a>
      </div>
    </Card>
  );
}
