"use client";

import clsx from "clsx";
import { ClipboardCheck, Ellipsis, FileSpreadsheet, History, LayoutGrid, LogOut, Map as MapIcon, Settings, Users, Cpu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "@/lib/devices";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { istParts } from "@/lib/format";
import { useNow, useSession } from "./session";
import { Avatar, Sheet, Spinner } from "./ui";

const NAV: { href: string; label: string; short: string; icon: typeof LayoutGrid; roles: Role[] }[] = [
  { href: "/", label: "Overview", short: "Overview", icon: LayoutGrid, roles: ["admin"] },
  { href: "/checklist", label: "Daily Checklist", short: "Checklist", icon: ClipboardCheck, roles: ["engineer"] },
  { href: "/devices", label: "Devices", short: "Devices", icon: Cpu, roles: ["admin", "engineer"] },
  { href: "/map", label: "Map", short: "Map", icon: MapIcon, roles: ["admin", "engineer"] },
  { href: "/engineers", label: "Engineers", short: "Team", icon: Users, roles: ["admin"] },
  { href: "/history", label: "History", short: "History", icon: History, roles: ["admin", "engineer"] },
  { href: "/excel", label: "Excel Workbook", short: "Excel", icon: FileSpreadsheet, roles: ["admin"] },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings, roles: ["admin"] },
];

export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#EEF1F7]">
      <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#7CC4FF] opacity-50 blur-[120px]" />
      <div className="absolute -right-32 top-20 h-[480px] w-[480px] rounded-full bg-[#C7B8FF] opacity-50 blur-[120px]" />
      <div className="absolute bottom-[-160px] left-1/3 h-[520px] w-[520px] rounded-full bg-[#8EE6D7] opacity-45 blur-[130px]" />
      <div className="absolute bottom-10 right-10 h-[300px] w-[300px] rounded-full bg-[#FFD1E1] opacity-40 blur-[110px]" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout } = useSession();
  const [more, setMore] = useState(false);
  const bare = pathname === "/login" || pathname === "/onboarding";

  if (bare)
    return (
      <>
        <Backdrop />
        {children}
      </>
    );

  if (loading || !user || !user.onboarded)
    return (
      <>
        <Backdrop />
        <div className="flex min-h-screen items-center justify-center">
          <Spinner />
        </div>
      </>
    );

  const items = NAV.filter((n) => n.roles.includes(user.role));
  const allowed = items.some((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));

  return (
    <>
      <Backdrop />
      {/* Sidebar (desktop) */}
      <aside className="glass fixed inset-y-3 left-3 z-30 hidden w-[248px] flex-col rounded-[28px] lg:flex">
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <Logo size={40} animated />
          <div className="leading-tight">
            <div className="text-[17px] font-bold tracking-[-0.02em]">{APP_NAME}</div>
            <div className="text-[12px] text-ios-gray">{user.role === "admin" ? "Administrator" : "Engineer"}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[15px] font-medium transition",
                  active ? "bg-ios-blue text-white shadow-[0_4px_14px_rgba(0,122,255,0.3)]" : "text-ios-label hover:bg-black/[0.04]",
                )}
              >
                <item.icon className={clsx("h-[19px] w-[19px]", active ? "text-white" : "text-ios-blue")} strokeWidth={2.2} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 flex items-center gap-3 rounded-[18px] bg-white/60 p-3 ring-1 ring-black/[0.04]">
          <Avatar name={user.name} picture={user.picture} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[14px] font-semibold">{user.name}</div>
            <div className="truncate text-[12px] text-ios-gray">{user.email}</div>
          </div>
          <button onClick={logout} className="flex h-8 w-8 items-center justify-center rounded-full text-ios-gray hover:bg-black/5 hover:text-ios-red" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <TopBar />
        <main className="mx-auto w-full min-w-0 max-w-[1280px] px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10">
          {allowed ? (
            children
          ) : (
            <div className="glass mx-auto mt-16 max-w-md rounded-3xl p-10 text-center">
              <p className="text-[17px] font-semibold">Not available for your role</p>
              <p className="mt-1 text-[15px] text-ios-gray">Use the menu to go to a page you have access to.</p>
            </div>
          )}
        </main>
      </div>

      {/* Tab bar (mobile): up to 5 slots, extra pages go under "More" */}
      <nav className="glass-strong fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-[24px] px-1 py-1.5 lg:hidden">
        {(items.length > 5 ? items.slice(0, 4) : items).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={clsx("flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold", active ? "text-ios-blue" : "text-ios-gray")}>
              <item.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
              {item.short}
            </Link>
          );
        })}
        {items.length > 5 && (
          <button
            onClick={() => setMore(true)}
            className={clsx(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-semibold",
              items.slice(4).some((i) => pathname.startsWith(i.href)) ? "text-ios-blue" : "text-ios-gray",
            )}
          >
            <Ellipsis className="h-[22px] w-[22px]" />
            More
          </button>
        )}
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <ul className="divide-y divide-ios-separator rounded-2xl bg-white/70 ring-1 ring-black/[0.05]">
          {items.slice(4).map((item) => (
            <li key={item.href}>
              <Link href={item.href} onClick={() => setMore(false)} className="flex items-center gap-3 px-4 py-3.5 text-[16px] font-medium">
                <item.icon className="h-5 w-5 text-ios-blue" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function TopBar() {
  const { user, logout } = useSession();
  const now = useNow(60000);
  const h = now ? istParts(now).h : null;
  const greeting = h === null ? "" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <header className="sticky top-0 z-20 px-4 pt-3 sm:px-6 lg:px-8">
      <div className="glass mx-auto flex h-14 max-w-[1280px] items-center gap-3 rounded-[20px] px-4">
        <span className="lg:hidden"><Logo size={32} animated /></span>
        {user && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[11px] font-medium text-ios-gray">
              {greeting ? `${greeting} · ` : ""}
              {user.role === "admin" ? "Administrator" : "Engineer"}
            </div>
            <div className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ios-label">{user.name}</div>
          </div>
        )}
        {user && <span className="ml-auto lg:ml-auto"><NotificationBell /></span>}
        <div className="flex shrink-0 items-center gap-1 lg:hidden">
          {user && <Avatar name={user.name} picture={user.picture} size={32} />}
          <button onClick={logout} className="flex h-8 w-8 items-center justify-center rounded-full text-ios-gray hover:bg-black/5" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
