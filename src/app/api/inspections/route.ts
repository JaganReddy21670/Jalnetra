import { fail, json, requireUser } from "@/server/auth";
import { mutate, newId, readDB } from "@/server/db";
import { DEADLINE_MIN, OFFLINE_REASONS, type Inspection } from "@/lib/devices";
import { istParts } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "0000-00-00";
  const to = url.searchParams.get("to") ?? "9999-99-99";
  const db = await readDB();
  const inspections = db.inspections.filter((i) => i.date >= from && i.date <= to && (g.user.role === "admin" || i.engineerId === g.user.id));
  return json({ inspections, today: istParts(new Date()).date });
}

/** Daily node check: is data coming? If offline, a reason and remarks are mandatory. */
export async function POST(req: Request) {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const dataStatus = body.dataStatus;
  if (dataStatus !== "Online" && dataStatus !== "Offline") return fail("Please say whether data is coming from the node");
  if (!body.lastDataReceived || isNaN(Date.parse(body.lastDataReceived))) return fail("Please enter when data was last received");
  if (Date.parse(body.lastDataReceived) > Date.now() + 5 * 60_000) return fail("Last data received can't be in the future");
  const remarks = String(body.remarks ?? "").trim().slice(0, 2000);
  const offlineReason = dataStatus === "Offline" ? String(body.offlineReason ?? "") : "";
  if (dataStatus === "Offline") {
    if (!(OFFLINE_REASONS as readonly string[]).includes(offlineReason)) return fail("Please choose why the node is offline");
    if (remarks.length < 5) return fail("Please describe the problem / action taken (at least 5 characters)");
  }
  if (!body.confirmed) return fail("Please confirm the check is complete");

  const now = new Date();
  const p = istParts(now);
  const result = await mutate((db) => {
    const d = db.devices.find((x) => x.id === body.deviceId);
    if (!d || !d.active) return { error: "Device not found", status: 404 };
    if (d.engineerId !== g.user.id) return { error: "Only the assigned engineer can check this device", status: 403 };
    if (g.user.deviceTypes?.length && !g.user.deviceTypes.includes(d.type)) return { error: "You don't have access to this device type", status: 403 };
    if (db.inspections.some((i) => i.deviceId === d.id && i.date === p.date)) return { error: "This device has already been checked today", status: 409 };
    const ins: Inspection = {
      id: newId("INS"),
      deviceId: d.id,
      engineerId: g.user.id,
      date: p.date,
      submittedAt: now.toISOString(),
      answers: {
        dataStatus,
        lastDataReceived: new Date(body.lastDataReceived).toISOString(),
        offlineReason,
        condition: dataStatus === "Online" ? "Healthy" : "Issue Detected",
      },
      remarks,
      issueDescription: "",
      late: p.minutes >= DEADLINE_MIN,
    };
    db.inspections.push(ins);
    db.audit.push({ at: ins.submittedAt, actor: g.user.email, action: "Node checked", detail: `${d.id} · ${dataStatus}${offlineReason ? ` (${offlineReason})` : ""}${ins.late ? " · late" : ""}` });
    return { inspection: ins };
  });
  if ("error" in result) return fail(result.error!, result.status);
  return json(result);
}
