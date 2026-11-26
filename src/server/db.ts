import { promises as fs } from "fs";
import path from "path";
import { APP_SLUG } from "@/lib/brand";
import type { Device, Inspection, PublicUser } from "@/lib/devices";
import { parseGps } from "@/lib/gps";
import type { EmailSettings } from "./mailer";

export interface UserRecord extends PublicUser {
  passwordHash?: string;
  salt?: string;
  googleSub?: string;
}

export interface AlertSettings {
  reminder: boolean; // 4:00 PM IST reminder to engineers with unchecked nodes
  deadline: boolean; // 5:00 PM IST missed notice to engineers + escalation to admins
  extra: string[]; // extra escalation recipients besides all Administrators
}

export const defaultAlerts = (): AlertSettings => ({ reminder: true, deadline: true, extra: [] });

/** In-app notification shown under the bell. */
export interface AppNotification {
  id: string;
  userId: string;
  at: string;
  kind: "reminder" | "missed" | "escalation" | "info";
  title: string;
  body: string;
  read: boolean;
}

export interface AuditRecord {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface DB {
  settings: {
    adminCode?: string;
    googleClientId?: string;
    email?: EmailSettings;
    sessionSecret?: string;
    /** Daily deadline alerts. Defaults: both on, no extra recipients. */
    alerts?: AlertSettings;
    /** "<IST date>:<slot>" → ISO time sent. Prevents duplicate alerts; pruned to ~2 weeks. */
    alertLog?: Record<string, string>;
  };
  notifications?: AppNotification[];
  users: UserRecord[];
  devices: Device[];
  inspections: Inspection[];
  audit: AuditRecord[];
}

/** Where accounts, devices and the Excel file live. Hosts set DATA_DIR to a persistent disk. */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
export const EXCEL_FILE = path.join(DATA_DIR, `${APP_SLUG}-Devices.xlsx`);

const empty = (): DB => ({ settings: {}, users: [], devices: [], inspections: [], audit: [], notifications: [] });

/** Cloudflare D1 when STORAGE=d1 (set in wrangler.jsonc); otherwise a local JSON file. */
export const usingD1 = () => process.env.STORAGE === "d1";
/** True when data lives in a hosted database instead of the local data/ folder. */
export const usingDatabase = usingD1;

/** Fill defaults and upgrade records written by older versions. */
function normalize(raw: unknown): DB {
  const db: DB = { ...empty(), ...((raw as Partial<DB>) ?? {}) };
  db.settings ??= {};
  db.notifications ??= [];
  // Older accounts (created before per-type access existed): derive access from the devices they added.
  for (const u of db.users) {
    if (u.role === "engineer" && u.onboarded && !u.deviceTypes?.length) {
      const types = Array.from(new Set(db.devices.filter((d) => d.engineerId === u.id).map((d) => d.type)));
      if (types.length) u.deviceTypes = types;
    }
  }
  for (const d of db.devices) if (d.lat === undefined) Object.assign(d, parseGps(d.location) ?? {});
  return db;
}

export async function readDB(): Promise<DB> {
  if (usingD1()) {
    const { d1Read } = await import("./d1store");
    return normalize(await d1Read());
  }
  try {
    return normalize(JSON.parse(await fs.readFile(DB_FILE, "utf8")));
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw e;
  }
}

// Serialise local-file writes through one promise chain so concurrent requests can't clobber each other.
let queue: Promise<unknown> = Promise.resolve();

export function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  if (usingD1()) {
    return (async () => {
      const { d1Mutate } = await import("./d1store");
      return d1Mutate(empty(), async (doc) => {
        const db = normalize(doc);
        const result = await fn(db);
        return { doc: db, result };
      });
    })();
  }
  const run = queue.then(async () => {
    const db = await readDB();
    const result = await fn(db);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, DB_FILE);
    // Keep the Excel workbook on disk in sync (best effort; fails if it's open in Excel).
    import("./excel").then((m) => m.writeExcelFile(db)).catch((err) => console.warn("[excel] could not update workbook:", err?.message ?? err));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

export function toPublic(u: UserRecord): PublicUser {
  const { passwordHash: _p, salt: _s, googleSub: _g, ...rest } = u;
  return rest;
}

/** Make sure an engineer can access a device type (used when an admin assigns them a device). */
export function grantType(db: DB, userId: string, type: Device["type"]) {
  const u = db.users.find((x) => x.id === userId);
  if (!u || u.role !== "engineer" || !u.deviceTypes?.length) return;
  if (!u.deviceTypes.includes(type)) u.deviceTypes.push(type);
}

/** Validates optional lat/lng input. undefined = not supplied, null = clear. */
export function readCoords(body: { lat?: unknown; lng?: unknown }): { lat: number; lng: number } | null | undefined | { error: string } {
  const has = (v: unknown) => v !== undefined;
  if (!has(body.lat) && !has(body.lng)) return undefined;
  const blank = (v: unknown) => v === null || v === "";
  if (blank(body.lat) && blank(body.lng)) return null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (blank(body.lat) || blank(body.lng) || !Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "Enter both latitude and longitude as numbers" };
  if (lat < -90 || lat > 90) return { error: "Latitude must be between -90 and 90" };
  if (lng < -180 || lng > 180) return { error: "Longitude must be between -180 and 180" };
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** Sets a device's coordinates: explicit lat/lng if given, otherwise parsed from the location text. */
export function applyGps(d: Device, coords?: { lat: number; lng: number } | null) {
  if (coords) {
    d.lat = coords.lat;
    d.lng = coords.lng;
    return;
  }
  if (coords === null) {
    delete d.lat;
    delete d.lng;
    return;
  }
  const g = parseGps(d.location);
  if (g) Object.assign(d, g);
}
