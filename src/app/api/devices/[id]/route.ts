import { fail, json, requireUser } from "@/server/auth";
import { applyGps, grantType, mutate, readCoords } from "@/server/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const coords = readCoords(body);
  if (coords && "error" in coords) return fail(coords.error);
  const result = await mutate((db) => {
    const d = db.devices.find((x) => x.id === id);
    if (!d) return { error: "Device not found", status: 404 };
    if (g.user.role !== "admin" && d.engineerId !== g.user.id) return { error: "You can only edit your own devices", status: 403 };
    if (g.user.role !== "admin" && g.user.deviceTypes?.length && !g.user.deviceTypes.includes(d.type)) return { error: "You don't have access to this device type", status: 403 };
    const changes: string[] = [];
    const dupName = (name: string, owner: string) => db.devices.some((x) => x.id !== d.id && x.active && x.engineerId === owner && x.name.toLowerCase() === name.toLowerCase());
    if (typeof body.name === "string" && body.name.trim() && body.name.trim() !== d.name) {
      const name = body.name.trim().slice(0, 80);
      if (dupName(name, d.engineerId)) return { error: "A device with this name already exists", status: 409 };
      changes.push(`renamed to ${name}`);
      d.name = name;
    }
    if (typeof body.location === "string" && !body.location.trim()) return { error: "Deployment location is required", status: 400 };
    if (typeof body.location === "string" && body.location.trim() !== d.location) {
      changes.push("location");
      d.location = body.location.trim().slice(0, 120);
      if (coords === undefined) applyGps(d);
    }
    if (coords !== undefined && (coords?.lat !== d.lat || coords?.lng !== d.lng)) {
      changes.push(coords ? `GPS ${coords.lat}, ${coords.lng}` : "GPS cleared");
      applyGps(d, coords);
    }
    if (typeof body.active === "boolean" && body.active !== d.active) {
      if (body.active && dupName(d.name, d.engineerId)) return { error: `Another active device is already called "${d.name}". Rename one of them first.`, status: 409 };
      changes.push(body.active ? "restored" : "removed");
      d.active = body.active;
    }
    if (g.user.role === "admin" && typeof body.engineerId === "string" && body.engineerId !== d.engineerId) {
      const owner = db.users.find((u) => u.id === body.engineerId);
      if (!owner) return { error: "Engineer not found", status: 400 };
      if (owner.role !== "engineer") return { error: "Devices must be assigned to an engineer", status: 400 };
      if (dupName(d.name, owner.id)) return { error: `${owner.name} already has a device called "${d.name}"`, status: 409 };
      changes.push("reassigned");
      d.engineerId = body.engineerId;
      grantType(db, d.engineerId, d.type);
    }
    if (changes.length) db.audit.push({ at: new Date().toISOString(), actor: g.user.email, action: "Device updated", detail: `${d.id}: ${changes.join(", ")}` });
    return { device: d };
  });
  if ("error" in result) return fail(result.error!, result.status);
  return json(result);
}
