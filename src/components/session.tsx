"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@/lib/devices";

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

interface Session {
  user: PublicUser | null;
  loading: boolean;
  setUser: (u: PublicUser | null) => void;
  logout: () => Promise<void>;
  toast: (msg: string, kind?: "ok" | "error") => void;
}

const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside provider");
  return s;
};

const OPEN_PATHS = ["/login"];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<{ msg: string; kind: "ok" | "error" } | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    api<{ user: PublicUser | null }>("GET", "/api/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Route guards: signed-out → /login, new account → /onboarding, signed-in on /login → app.
  useEffect(() => {
    if (loading) return;
    if (!user && !OPEN_PATHS.includes(pathname)) router.replace("/login");
    else if (user && !user.onboarded && pathname !== "/onboarding") router.replace("/onboarding");
    else if (user && user.onboarded && (pathname === "/login" || pathname === "/onboarding")) router.replace(user.role === "admin" ? "/" : "/checklist");
    else if (user && user.role === "engineer" && pathname === "/") router.replace("/checklist");
  }, [loading, user, pathname, router]);

  const logout = useCallback(async () => {
    await api("POST", "/api/auth/logout").catch(() => undefined);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const toast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    setToastMsg({ msg, kind });
    window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, setUser, logout, toast }}>
      {children}
      {toastMsg && (
        <div className="fixed left-1/2 top-5 z-[70] flex -translate-x-1/2 animate-rise items-center gap-2 rounded-full bg-[#1c1c1e]/85 px-4 py-2.5 text-[14px] font-medium text-white shadow-float backdrop-blur-xl">
          {toastMsg.kind === "ok" ? <CheckCircle2 className="h-4 w-4 text-ios-green" /> : <AlertCircle className="h-4 w-4 text-ios-red" />}
          {toastMsg.msg}
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Minimal data hook: GET a JSON endpoint, with reload(). */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    api<T>("GET", url)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Live clock; null until mounted (avoids hydration mismatch). */
export function useNow(intervalMs = 15000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
