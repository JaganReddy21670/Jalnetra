import { fail, json, requireUser, toPublic } from "@/server/auth";
import { applyGps, mutate, newId, readCoords } from "@/server/db";
import { DEVICE_TYPES, type Device } from "@/lib/devices";

/** Completes onboarding: saves the engineer's initial device list. Admins may finish with no devices. */
export async function POST(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const { devices } = await req.json().catch(() => ({ devices: [] }));
  const list = Array.isArray(devices) ? devices : [];
  const clean: { type: string; name: string; location: string; coords?: { lat: number; lng: number } | null }[] = [];
  for (const d of list) {
    const type = String(d?.type ?? "");
    const name = String(d?.name ?? "").trim();
    if (!DEVICE_TYPES.some((t) => t.key === type)) return fail(`Unknown device type: ${type}`);
    const location = String(d?.location ?? "").trim();
    if (!name) return fail("Every device needs a name");
    if (!location) return fail(`Please enter where "${name}" is deployed`);
    const coords = readCoords(d ?? {});
    if (coords && "error" in coords) return fail(`${name}: ${coords.error}`);
    clean.push({ type, name: name.slice(0, 80), location: location.slice(0, 120), coords });
  }
  const names = clean.map((c) => c.name.toLowerCase());
  if (new Set(names).size !== names.length) return fail("Device names must be unique");
  if (g.user.role === "engineer" && clean.length === 0) return fail("Add at least one device that you'll check daily");

  const user = await mutate((db) => {
    const now = new Date().toISOString();
    const existing = new Set(db.devices.filter((d) => d.engineerId === g.user.id && d.active).map((d) => d.name.toLowerCase()));
    for (const c of clean) {
      if (existing.has(c.name.toLowerCase())) continue;
      const dev: Device = { id: newId("DEV"), type: c.type as Device["type"], name: c.name, location: c.location, engineerId: g.user.id, active: true, createdAt: now };
      applyGps(dev, c.coords);
      db.devices.push(dev);
    }
    const u = db.users.find((x) => x.id === g.user.id)!;
    u.onboarded = true;
    if (u.role === "engineer") u.deviceTypes = Array.from(new Set(clean.map((c) => c.type))) as Device["type"][];
    db.audit.push({ at: now, actor: u.email, action: "Onboarding completed", detail: `${clean.length} device(s) added` });
    return u;
  });
  return json({ user: toPublic(user) });
}
