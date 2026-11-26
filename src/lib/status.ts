import { DEADLINE_MIN, type Device, type Inspection } from "./devices";
import { istParts } from "./format";

export type DayState = "healthy" | "issue" | "late" | "pending" | "missed";

export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Status of one device on one IST date. null = device didn't exist yet. */
export function dayState(device: Device, ins: Inspection | undefined, date: string, now: Date): DayState | null {
  const p = istParts(now);
  if (ins) return ins.answers.condition === "Issue Detected" ? "issue" : ins.late ? "late" : "healthy";
  if (!device.active) return null;
  if (date === p.date) return p.minutes < DEADLINE_MIN ? "pending" : "missed";
  if (date >= istParts(new Date(device.createdAt)).date && date < p.date) return "missed";
  return null;
}

export function indexInspections(list: Inspection[]) {
  const m = new Map<string, Inspection>();
  for (const i of list) m.set(`${i.deviceId}|${i.date}`, i);
  return m;
}

export interface Uptime {
  /** % of checked days on which data was coming (null = never checked in the window). */
  pct: number | null;
  online: number;
  offline: number;
  /** Days in the window since the device was added. */
  expected: number;
  /** % of expected days that were actually checked. */
  coverage: number;
}

/** Uptime over the last `days` IST days (including today), based on daily checks. */
export function uptime(device: Device, idx: Map<string, Inspection>, today: string, days = 30): Uptime {
  const created = istParts(new Date(device.createdAt)).date;
  let online = 0;
  let offline = 0;
  let expected = 0;
  for (let k = 0; k < days; k++) {
    const date = shiftDate(today, -k);
    if (date < created) break;
    expected++;
    const ins = idx.get(`${device.id}|${date}`);
    if (ins) ins.answers.dataStatus === "Online" ? online++ : offline++;
  }
  const checked = online + offline;
  return { pct: checked ? Math.round((online / checked) * 100) : null, online, offline, expected, coverage: expected ? Math.round((checked / expected) * 100) : 0 };
}

export const uptimeColor = (pct: number | null) => (pct === null ? "#8E8E93" : pct >= 95 ? "#34C759" : pct >= 80 ? "#FF9500" : "#FF3B30");
