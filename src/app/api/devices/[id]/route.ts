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
    if (typeof body.name === "string" && body.name.trim() && body.name.trim() !== d.name) {
      changes.push(`renamed to ${body.name.trim()}`);
      d.name = body.name.trim().slice(0, 80);
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
      changes.push(body.active ? "restored" : "removed");
      d.active = body.active;
    }
    if (g.user.role === "admin" && typeof body.engineerId === "string" && body.engineerId !== d.engineerId) {
      if (!db.users.some((u) => u.id === body.engineerId)) return { error: "Engineer not found", status: 400 };
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
