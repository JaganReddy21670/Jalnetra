"use client";

import clsx from "clsx";
import { Check, Copy, ExternalLink, Eye, KeyRound, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { api, useApi, useSession } from "@/components/session";
import { Badge, Button, Card, CardHeader, Field, PageHeader, Segmented, Spinner, Toggle, inputCls, textareaCls, LoadError } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";
import { AlertsCard, EmailAccountCard, WeeklySummaryCard, type AlertsS, type EmailS } from "@/components/EmailSettings";

type S = { googleClientId: string | null; googleFromEnv: boolean; adminCode: string | null; email: EmailS; alerts: AlertsS };

export default function SettingsPage() {
  const { toast } = useSession();
  const res = useApi<S>("/api/settings");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setClientId(res.data?.googleClientId ?? ""), [res.data]);

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  async function save(patch: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await api("PATCH", "/api/settings", patch);
      toast(msg);
      res.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (res.error && !res.data) return <LoadError message={res.error} onRetry={res.reload} />;
  if (!res.data) return <div className="flex justify-center py-24"><Spinner /></div>;
  const on = !!res.data.googleClientId;

  return (
    <>
      <PageHeader title="Settings" subtitle={`Email, notifications and access for ${APP_NAME}`} />

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <EmailAccountCard key={`acct-${JSON.stringify(res.data.email)}`} email={res.data.email} onSaved={res.reload} />
        <AlertsCard key={JSON.stringify(res.data.alerts)} alerts={res.data.alerts} emailReady={res.data.email.passSet && !!res.data.email.user} onSaved={res.reload} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        {/* Google sign-in */}
        <Card>
          <CardHeader
            title="Sign in with Google"
            subtitle="Let engineers and admins use their Google account"
            action={<Badge tone={on ? "green" : "gray"} dot>{on ? "On" : "Off"}</Badge>}
          />
          <div className="space-y-5 px-5 pb-6 sm:px-6">
            <ol className="space-y-3">
              <Step n={1}>
                Open{" "}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-ios-blue hover:underline">
                  Google Cloud → Credentials <ExternalLink className="h-3.5 w-3.5" />
                </a>{" "}
                and sign in with your Google account. Create a project if asked.
              </Step>
              <Step n={2}>
                If prompted, set up the <b>OAuth consent screen</b>: choose <b>External</b>, enter the app name ({APP_NAME}) and your email, then save.
              </Step>
              <Step n={3}>
                Click <b>Create credentials → OAuth client ID</b>, choose <b>Web application</b>, and under <b>Authorised JavaScript origins</b> add:
                <button
                  onClick={() => copy(origin, "origin")}
                  className="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 font-mono text-[13px] ring-1 ring-black/[0.06] hover:bg-white"
                >
                  {origin}
                  {copied === "origin" ? <Check className="h-4 w-4 text-ios-green" /> : <Copy className="h-4 w-4 text-ios-gray" />}
                </button>
                <span className="mt-1 block text-[12px] text-ios-gray">Add your real web address here too once the app is online.</span>
              </Step>
              <Step n={4}>Click <b>Create</b>, copy the <b>Client ID</b> and paste it below. (You don&apos;t need the client secret.)</Step>
            </ol>

            <Field label="Google Client ID" hint={res.data.googleFromEnv ? "Set in .env.local on the server" : "Looks like 1234567890-abc123.apps.googleusercontent.com"}>
              <input
                className={clsx(inputCls, "font-mono text-[13px]")}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxxxxxx-xxxxxxxx.apps.googleusercontent.com"
                disabled={res.data.googleFromEnv}
                spellCheck={false}
              />
            </Field>
            {!res.data.googleFromEnv && (
              <div className="flex flex-wrap gap-2">
                <Button loading={busy} disabled={!clientId.trim() || clientId.trim() === res.data.googleClientId} onClick={() => save({ googleClientId: clientId.trim() }, "Google sign-in is on")}>
                  {on ? "Update" : "Turn On Google Sign-in"}
                </Button>
                {on && (
                  <Button variant="plain" className="text-ios-red hover:bg-ios-red/10" disabled={busy} onClick={() => save({ googleClientId: "" }, "Google sign-in turned off")}>
                    Turn Off
                  </Button>
                )}
              </div>
            )}
            {on && (
              <p className="rounded-2xl bg-ios-green/10 px-4 py-3 text-[13px] text-[#248A3D]">
                Google sign-in is live. Sign out and you&apos;ll see the &ldquo;Sign in with Google&rdquo; button on the login screen.
              </p>
            )}
          </div>
        </Card>

        {/* Admin access code */}
        <Card className="self-start">
          <CardHeader title="Admin access code" subtitle="Needed to create another Administrator account" />
          <div className="space-y-4 px-5 pb-6 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#7D7AFF] to-[#5856D6] text-white">
                <KeyRound className="h-5 w-5" strokeWidth={2.4} />
              </span>
              <button
                onClick={() => res.data?.adminCode && copy(res.data.adminCode, "code")}
                className="flex flex-1 items-center justify-between rounded-2xl bg-white/80 px-4 py-2.5 font-mono text-[20px] font-bold tracking-[0.25em] ring-1 ring-black/[0.06] hover:bg-white"
              >
                {res.data.adminCode ?? "—"}
                {copied === "code" ? <Check className="h-4 w-4 text-ios-green" /> : <Copy className="h-4 w-4 text-ios-gray" />}
              </button>
            </div>
            <p className="text-[13px] text-ios-gray">Share it only with people who should see everything. Generate a new one if it&apos;s been shared too widely. The old code stops working immediately.</p>
            <Button variant="secondary" disabled={busy} onClick={() => save({ rotateAdminCode: true }, "New admin access code generated")}>
              <RefreshCw className="h-4 w-4" /> Generate New Code
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <WeeklySummaryCard key={JSON.stringify(res.data.email)} email={res.data.email} onSaved={res.reload} />
      </div>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ios-blue text-[12px] font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed text-ios-label">{children}</div>
    </li>
  );
}
