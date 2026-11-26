"use client";

import clsx from "clsx";
import { AlertTriangle, Bell, BellRing, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/format";
import { api } from "./session";
import { Sheet } from "./ui";

interface Note {
  id: string;
  at: string;
  kind: "reminder" | "missed" | "escalation" | "info";
  title: string;
  body: string;
  read: boolean;
}

const ICON = {
  reminder: { icon: BellRing, cls: "bg-ios-orange/15 text-[#C93400]" },
  missed: { icon: AlertTriangle, cls: "bg-ios-red/12 text-[#D70015]" },
  escalation: { icon: ShieldAlert, cls: "bg-ios-red/12 text-[#D70015]" },
  info: { icon: Bell, cls: "bg-ios-blue/10 text-ios-blue" },
} as const;

/** Bell with unread count; opens the latest notifications and marks them read. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    api<{ notifications: Note[]; unread: number }>("GET", "/api/notifications")
      .then((r) => {
        setNotes(r.notifications);
        setUnread(r.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  function show() {
    setOpen(true);
    if (unread > 0) {
      setUnread(0);
      api("POST", "/api/notifications").catch(() => undefined);
    }
  }

  return (
    <>
      <button onClick={show} className="relative flex h-9 w-9 items-center justify-center rounded-full text-ios-label hover:bg-black/5" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
        <Bell className="h-[20px] w-[20px]" strokeWidth={2.1} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ios-red px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <Sheet open={open} onClose={() => { setOpen(false); load(); }} title="Notifications">
        {notes.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-ios-gray" />
            <p className="mt-3 text-[15px] font-semibold">No notifications yet</p>
            <p className="mt-1 text-[13px] text-ios-gray">Reminders arrive at 4:00 PM and deadline alerts at 5:00 PM IST.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ios-separator rounded-2xl bg-white/70 ring-1 ring-black/[0.05]">
            {notes.map((n) => {
              const m = ICON[n.kind] ?? ICON.info;
              return (
                <li key={n.id} className="flex gap-3 px-4 py-3">
                  <span className={clsx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]", m.cls)}>
                    <m.icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={clsx("text-[15px] leading-snug", n.read ? "font-medium" : "font-semibold")}>{n.title}</p>
                    {n.body && <p className="mt-0.5 text-[13px] leading-snug text-ios-gray">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-ios-gray">{fmtDateTime(n.at)}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ios-blue" aria-label="unread" />}
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
