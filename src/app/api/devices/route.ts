import { fail, json, requireUser } from "@/server/auth";
import { applyGps, grantType, mutate, newId, readCoords, readDB } from "@/server/db";
import { DEVICE_TYPES, type Device } from "@/lib/devices";

export const dynamic = "force-dynamic";

/** Engineers get their own devices; admins get every device. */
export async function GET() {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const db = await readDB();
  const allowed = g.user.deviceTypes;
  const devices =
    g.user.role === "admin"
      ? db.devices
      : db.devices.filter((d) => d.engineerId === g.user.id && (!allowed?.length || allowed.includes(d.type)));
  return json({ devices });
}

export async function POST(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? "");
  const name = String(body.name ?? "").trim().slice(0, 80);
  const location = String(body.location ?? "").trim().slice(0, 120);
  if (!DEVICE_TYPES.some((t) => t.key === type)) return fail("Choose a device type");
  if (!name) return fail("Device name is required");
  if (!location) return fail("Deployment location is required");
  const coords = readCoords(body);
  if (coords && "error" in coords) return fail(coords.error);
  // Engineers may only add device types they were set up for.
  const allowed = g.user.deviceTypes ?? [];
  if (g.user.role === "engineer" && allowed.length && !allowed.includes(type as Device["type"]))
    return fail(`You can only add ${allowed.map((t) => DEVICE_TYPES.find((x) => x.key === t)?.label).join(", ")} devices. Ask your administrator to give you access to other types.`, 403);
  // Admins can create a device for a specific engineer.
  const engineerId = g.user.role === "admin" && body.engineerId ? String(body.engineerId) : g.user.id;

  const result = await mutate((db) => {
    if (!db.users.some((u) => u.id === engineerId)) return { error: "Engineer not found" };
    if (db.devices.some((d) => d.engineerId === engineerId && d.active && d.name.toLowerCase() === name.toLowerCase()))
      return { error: "A device with this name already exists" };
    const device: Device = { id: newId("DEV"), type: type as Device["type"], name, location, engineerId, active: true, createdAt: new Date().toISOString() };
    applyGps(device, coords);
    grantType(db, engineerId, device.type);
    db.devices.push(device);
    db.audit.push({ at: device.createdAt, actor: g.user.email, action: "Device added", detail: `${device.id} ${name}` });
    return { device };
  });
  if ("error" in result) return fail(result.error!, 409);
  return json(result);
}
