import { fail, json, requireUser, toPublic } from "@/server/auth";
import { mutate } from "@/server/db";
import { DEVICE_TYPES, type DeviceTypeKey } from "@/lib/devices";

type Ctx = { params: Promise<{ id: string }> };

/** Admin changes a user's role and/or which device types an engineer may access. */
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const { id } = await params;
  const { role, deviceTypes } = await req.json().catch(() => ({}));
  if (role !== undefined && role !== "admin" && role !== "engineer") return fail("Invalid role");
  let types: DeviceTypeKey[] | undefined;
  if (deviceTypes !== undefined) {
    if (!Array.isArray(deviceTypes) || deviceTypes.some((t) => !DEVICE_TYPES.some((x) => x.key === t))) return fail("Invalid device types");
    if (deviceTypes.length === 0) return fail("An engineer needs access to at least one device type");
    types = Array.from(new Set(deviceTypes)) as DeviceTypeKey[];
  }
  const result = await mutate((db) => {
    const u = db.users.find((x) => x.id === id);
    if (!u) return { error: "User not found", status: 404 };
    const now = new Date().toISOString();
    if (role && role !== u.role) {
      if (u.role === "admin" && role === "engineer" && db.users.filter((x) => x.role === "admin").length === 1)
        return { error: "There must be at least one administrator", status: 400 };
      const owned = db.devices.filter((d) => d.active && d.engineerId === u.id).length;
      if (role === "admin" && owned)
        return { error: `${u.name} still has ${owned} device${owned > 1 ? "s" : ""} to check. Reassign ${owned > 1 ? "them" : "it"} to another engineer on the Devices page first.`, status: 409 };
      u.role = role;
      db.audit.push({ at: now, actor: g.user.email, action: "Role changed", detail: `${u.email} → ${role}` });
    }
    if (types) {
      const stranded = db.devices.filter((d) => d.active && d.engineerId === u.id && !types!.includes(d.type));
      if (stranded.length) {
        const label = DEVICE_TYPES.find((t) => t.key === stranded[0].type)?.label ?? stranded[0].type;
        return { error: `${u.name} still has ${stranded.length} device${stranded.length > 1 ? "s" : ""} of a type you removed (e.g. ${label}: ${stranded[0].name}). Reassign or remove ${stranded.length > 1 ? "them" : "it"} first.`, status: 409 };
      }
      u.deviceTypes = types;
      db.audit.push({ at: now, actor: g.user.email, action: "Device access changed", detail: `${u.email} → ${types.join(", ")}` });
    }
    return { user: u };
  });
  if ("error" in result) return fail(result.error!, result.status);
  return json({ user: toPublic(result.user!) });
}
