"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Eye, EyeOff, HardHat, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useSession } from "@/components/session";
import { Button, Field, Segmented, inputCls } from "@/components/ui";
import type { PublicUser, Role } from "@/lib/devices";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/Logo";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const ROLES: { key: Role; title: string; text: string; icon: typeof ShieldCheck; gradient: string }[] = [
  { key: "admin", title: "Administrator", text: "Monitor every engineer, device and daily check. Download the Excel workbook.", icon: ShieldCheck, gradient: "from-[#7D7AFF] to-[#5856D6]" },
  { key: "engineer", title: "Engineer", text: "Add the devices you've deployed and check each node daily.", icon: HardHat, gradient: "from-[#38B6FF] to-[#007AFF]" },
];

export default function LoginPage() {
  const router = useRouter();
  const { setUser, toast } = useSession();
  const [role, setRole] = useState<Role | null>(null);
  const [mode, setMode] = useState<"Sign In" | "Create Account">("Sign In");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<{ googleClientId: string | null; adminExists: boolean; adminCodeRequired?: boolean } | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const gBtn = useRef<HTMLDivElement>(null);
  const creating = mode === "Create Account";
  const needCode = role === "admin" && creating && !!(cfg?.adminExists || cfg?.adminCodeRequired);

  const done = useCallback(
    (u: PublicUser) => {
      setUser(u);
      router.replace(!u.onboarded ? "/onboarding" : u.role === "admin" ? "/" : "/checklist");
    },
    [router, setUser],
  );

  useEffect(() => {
    api<{ googleClientId: string | null; adminExists: boolean; adminCodeRequired?: boolean }>("GET", "/api/config")
      .then(setCfg)
      .catch(() => setCfg({ googleClientId: null, adminExists: true }));
  }, []);

  // Google button needs the latest role/code in its callback, so re-render it when they change.
  useEffect(() => {
    if (!role || !cfg?.googleClientId || !gsiReady || !window.google || !gBtn.current) return;
    window.google.accounts.id.initialize({
      client_id: cfg.googleClientId,
      callback: async ({ credential }) => {
        try {
          setBusy(true);
          setError(null);
          const r = await api<{ user: PublicUser }>("POST", "/api/auth/google", { credential, role, adminCode });
          done(r.user);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
    gBtn.current.innerHTML = "";
    window.google.accounts.id.renderButton(gBtn.current, { theme: "outline", size: "large", shape: "pill", text: creating ? "signup_with" : "signin_with", width: 320 });
  }, [role, cfg, gsiReady, creating, adminCode, done]);

  function pickRole(r: Role) {
    setRole(r);
    setError(null);
    // The very first administrator has no account yet, so start them on Create Account.
    setMode(r === "admin" && cfg && !cfg.adminExists ? "Create Account" : "Sign In");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = creating
        ? await api<{ user: PublicUser }>("POST", "/api/auth/register", { name, email, password, role, adminCode })
        : await api<{ user: PublicUser }>("POST", "/api/auth/login", { email, password, role });
      done(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sel = ROLES.find((r) => r.key === role);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      {cfg?.googleClientId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setGsiReady(true)} />}

      <div className="mb-8 flex flex-col items-center text-center">
        {/* Logo with water ripples spreading out */}
        <div className="relative h-[84px] w-[84px]">
          <span className="jn-ripple" />
          <span className="jn-ripple" />
          <span className="jn-ripple" />
          <Logo size={84} animated className="jn-pop relative" />
        </div>
        <h1 className="mt-6 text-[40px] font-bold leading-none tracking-[-0.03em]" aria-label={APP_NAME}>
          {APP_NAME.split("").map((ch, i) => (
            <span key={i} aria-hidden className="jn-letter" style={{ animationDelay: `${250 + i * 60}ms` }}>
              {i >= 3 ? <span className="jn-shimmer">{ch}</span> : ch}
            </span>
          ))}
        </h1>
        {role && (
          <p className="mt-3 animate-rise text-[17px] font-medium text-[#3C3C43]/80" style={{ animationDelay: "200ms" }}>
            Sign in to continue
          </p>
        )}
      </div>

      {!role ? (
        /* ---------- Step 1: choose role ---------- */
        <div className="grid w-full max-w-[640px] gap-4 sm:grid-cols-2">
          {ROLES.map((r, i) => (
            <button
              key={r.key}
              onClick={() => pickRole(r.key)}
              className="glass-strong group flex animate-rise flex-col items-start rounded-[28px] p-6 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-float active:scale-[0.98]"
              style={{ animationDelay: `${80 + i * 70}ms` }}
            >
              <span className={clsx("flex h-14 w-14 items-center justify-center rounded-[16px] bg-gradient-to-br text-white shadow-pill", r.gradient)}>
                <r.icon className="h-7 w-7" strokeWidth={2.2} />
              </span>
              <span className="mt-5 text-[22px] font-bold tracking-[-0.02em]">{r.title}</span>
              <span className="mt-1.5 text-[15px] leading-snug text-ios-gray">{r.text}</span>
              <span className="mt-5 inline-flex items-center gap-1 text-[15px] font-semibold text-ios-blue">
                Continue <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      ) : (
        /* ---------- Step 2: credentials ---------- */
        <div className="glass-strong w-full max-w-[400px] animate-rise rounded-[28px] p-6 sm:p-7">
          <div className="mb-5 flex items-center justify-between">
            <button onClick={() => { setRole(null); setError(null); }} className="-ml-1 flex items-center text-[15px] text-ios-blue">
              <ChevronLeft className="h-5 w-5" /> Back
            </button>
            {sel && (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/80 py-1 pl-1 pr-3 text-[13px] font-semibold ring-1 ring-black/[0.05]">
                <span className={clsx("flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-white", sel.gradient)}>
                  <sel.icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
                {sel.title}
              </span>
            )}
          </div>

          <Segmented value={mode} options={["Sign In", "Create Account"] as const} onChange={(m) => { setMode(m); setError(null); }} neutral />

          {role === "admin" && creating && cfg && !cfg.adminExists && (
            <p className="mt-4 rounded-xl bg-ios-blue/10 px-3 py-2 text-[13px] text-ios-blueDark">You&apos;ll be the first Administrator of this workspace.</p>
          )}

          {needCode && (
            <div className="mt-4">
              <Field label={cfg?.adminExists ? "Admin access code" : "Setup code"} hint={cfg?.adminExists ? "Ask an existing administrator. It's shown on their Settings page." : "The one-time setup code given to the person who installed JalNetra."}>
                <input className={clsx(inputCls, "font-mono uppercase tracking-[0.2em]")} value={adminCode} onChange={(e) => setAdminCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" maxLength={8} />
              </Field>
            </div>
          )}

          {/* Google button only appears once an admin has turned it on in Settings. */}
          {cfg?.googleClientId && (
            <>
              <div className="mt-5 flex min-h-[44px] justify-center">
                <div ref={gBtn} className="flex justify-center" />
              </div>
              <div className="my-5 flex items-center gap-3 text-[13px] text-ios-gray">
                <span className="h-px flex-1 bg-ios-separator" /> or use email <span className="h-px flex-1 bg-ios-separator" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={cfg?.googleClientId ? "space-y-4" : "mt-5 space-y-4"}>
            {creating && (
              <Field label="Full name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" required />
              </Field>
            )}
            <Field label="Email">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" required />
            </Field>
            <Field label="Password" hint={creating ? "At least 8 characters" : undefined}>
              <div className="relative">
                <input
                  className={inputCls + " pr-11"}
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={creating ? "new-password" : "current-password"}
                  minLength={creating ? 8 : undefined}
                  required
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ios-gray hover:text-ios-label" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {error && <p className="rounded-xl bg-ios-red/10 px-3 py-2 text-[13px] font-medium text-[#D70015]">{error}</p>}

            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={needCode && adminCode.length < 8}>
              {creating ? `Create ${sel?.title} Account` : "Sign In"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
