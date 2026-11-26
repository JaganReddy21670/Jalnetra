import ExcelJS from "exceljs";
import { promises as fs } from "fs";
import { DEVICE_TYPES, type Device, type Inspection } from "@/lib/devices";
import { DATA_DIR, EXCEL_FILE, type DB } from "./db";
import { istParts } from "@/lib/format";
import { dueOn, indexInspections, uptime } from "@/lib/status";
import { APP_NAME } from "@/lib/brand";

const DAYS = 31;
const NAVY = "FF1C1C1E";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D3762" } };
const FILL = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const STATUS = {
  healthy: { text: "✓", fill: FILL("FFD1F5DC"), font: "FF1E7B3A" },
  issue: { text: "!", fill: FILL("FFFFD6D3"), font: "FFB3261E" },
  late: { text: "L", fill: FILL("FFFFE7C2"), font: "FF9A5B00" },
  missed: { text: "✗", fill: FILL("FFF2F2F7"), font: "FF8E8E93" },
  pending: { text: "…", fill: FILL("FFFFF4CC"), font: "FF8A6D00" },
};

const ist = (iso: string) => {
  const p = istParts(new Date(iso));
  return { date: p.date, time: `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}` };
};
const shift = (date: string, d: number) => {
  const x = new Date(`${date}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: "FF0D1D37" } } };
  });
  row.height = 30;
}

function title(ws: ExcelJS.Worksheet, text: string, sub: string, span: number) {
  ws.mergeCells(1, 1, 1, Math.max(span, 4));
  const t = ws.getCell(1, 1);
  t.value = text;
  t.font = { bold: true, size: 16, color: { argb: NAVY } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, Math.max(span, 4));
  const s = ws.getCell(2, 1);
  s.value = sub;
  s.font = { size: 10, color: { argb: "FF6E6E73" } };
}

export async function buildWorkbook(db: DB): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();
  const now = new Date();
  const today = istParts(now).date;
  const nowMin = istParts(now).minutes;
  const generated = `Generated ${today} ${ist(now.toISOString()).time} IST · Admin-only workbook`;
  const user = (id: string) => db.users.find((u) => u.id === id);
  const insByDevDay = new Map<string, Inspection>();
  for (const i of db.inspections) insByDevDay.set(`${i.deviceId}|${i.date}`, i);
  const upIdx = indexInspections(db.inspections);
  const dates = Array.from({ length: DAYS }, (_, k) => shift(today, -(DAYS - 1 - k))); // oldest → today

  // ---------- Summary ----------
  const sum = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FF007AFF" } }, views: [{ showGridLines: false }] });
  title(sum, `${APP_NAME} · Device Inspection Workbook`, generated, 6);
  sum.addRow([]);
  const sh = sum.addRow(["Device Type", "Active Devices", "Engineers", "Checked Today", "Offline Today", "Pending Today"]);
  styleHeader(sh);
  for (const t of DEVICE_TYPES) {
    const devs = db.devices.filter((d) => d.type === t.key && d.active);
    const todays = devs.map((d) => insByDevDay.get(`${d.id}|${today}`)).filter(Boolean) as Inspection[];
    sum.addRow([
      t.label,
      devs.length,
      new Set(devs.map((d) => d.engineerId)).size,
      todays.length,
      todays.filter((i) => i.answers.condition === "Issue Detected").length,
      devs.filter((d) => dueOn(d, today) && !insByDevDay.has(`${d.id}|${today}`)).length,
    ]);
  }
  const totalRow = sum.addRow([
    "Total",
    { formula: `SUM(B5:B${4 + DEVICE_TYPES.length})` },
    new Set(db.devices.filter((d) => d.active).map((d) => d.engineerId)).size,
    { formula: `SUM(D5:D${4 + DEVICE_TYPES.length})` },
    { formula: `SUM(E5:E${4 + DEVICE_TYPES.length})` },
    { formula: `SUM(F5:F${4 + DEVICE_TYPES.length})` },
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((c) => (c.border = { top: { style: "thin" } }));
  sum.columns.forEach((c, i) => (c.width = i === 0 ? 22 : 16));
  {
    const ups = db.devices.filter((d) => d.active).map((d) => uptime(d, upIdx, today));
    const on = ups.reduce((a, u) => a + u.online, 0);
    const all = ups.reduce((a, u) => a + u.online + u.offline, 0);
    sum.addRow([]);
    const r = sum.addRow(["Fleet uptime (30 days)", all ? on / all : "—"]);
    r.font = { bold: true };
    if (all) r.getCell(2).numFmt = "0%";
  }
  sum.addRow([]);
  sum.addRow(["Legend (device sheets):"]).font = { bold: true };
  for (const [k, v] of Object.entries({ healthy: "Checked – data coming (online)", issue: "Checked – node offline", late: "Checked after 5:00 PM IST", missed: "Not checked", pending: "Today – not yet checked" })) {
    const r = sum.addRow([STATUS[k as keyof typeof STATUS].text, v]);
    r.getCell(1).fill = STATUS[k as keyof typeof STATUS].fill;
    r.getCell(1).font = { bold: true, color: { argb: STATUS[k as keyof typeof STATUS].font } };
    r.getCell(1).alignment = { horizontal: "center" };
  }

  // ---------- One sub-sheet per device type ----------
  for (const t of DEVICE_TYPES) {
    const devs = db.devices.filter((d) => d.type === t.key).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    const ws = wb.addWorksheet(t.sheet, {
      properties: { tabColor: { argb: "FF" + t.color.slice(1).toUpperCase() } },
      views: [{ state: "frozen", xSplit: 3, ySplit: 4, showGridLines: false }],
    });
    const fixed = ["S.No", "Device ID", "Device Name", "Deployment Location", "Engineer", "Engineer Email", "Added On", "Status", "Last Check", "Last Result", "Uptime % (30d)", "Latitude", "Longitude"];
    title(ws, `${t.label} devices`, `${devs.filter((d) => d.active).length} active · daily status for the last ${DAYS} days · ${generated}`, fixed.length + 6);
    ws.addRow([]);
    const header = ws.addRow([...fixed, ...dates.map((d) => d.slice(5).split("-").reverse().join("/"))]);
    styleHeader(header);
    if (!devs.length) {
      const r = ws.addRow(["", "No devices of this type yet"]);
      r.font = { italic: true, color: { argb: "FF8E8E93" } };
    }
    devs.forEach((d, idx) => {
      const eng = user(d.engineerId);
      const last = db.inspections.filter((i) => i.deviceId === d.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
      const created = ist(d.createdAt).date;
      const row = ws.addRow([
        idx + 1,
        d.id,
        d.name,
        d.location || "—",
        eng?.name ?? "—",
        eng?.email ?? "—",
        created,
        d.active ? "Active" : "Removed",
        last ? `${last.date} ${ist(last.submittedAt).time}` : "Never",
        last ? (last.answers.dataStatus === "Online" ? "Online" : `Offline – ${last.answers.offlineReason}`) : "—",
        (() => {
          const u = uptime(d, upIdx, today);
          return u.pct === null ? "—" : u.pct / 100;
        })(),
        d.lat ?? "—",
        d.lng ?? "—",
        ...dates.map(() => ""),
      ]);
      dates.forEach((date, k) => {
        const cell = row.getCell(fixed.length + 1 + k);
        const ins = insByDevDay.get(`${d.id}|${date}`);
        let st: keyof typeof STATUS | null = null;
        if (ins) st = ins.answers.condition === "Issue Detected" ? "issue" : ins.late ? "late" : "healthy";
        else if (d.active && dueOn(d, date)) st = date === today ? (nowMin < 17 * 60 ? "pending" : "missed") : "missed";
        else if (d.active && date === today) st = "pending";
        if (!st) return;
        cell.value = STATUS[st].text;
        cell.fill = STATUS[st].fill;
        cell.font = { bold: true, color: { argb: STATUS[st].font } };
        cell.alignment = { horizontal: "center" };
        if (ins) cell.note = `${ins.answers.dataStatus}${ins.answers.offlineReason ? ` – ${ins.answers.offlineReason}` : ""}${ins.late ? " (late)" : ""}${ins.remarks ? `\n${ins.remarks}` : ""}`;
      });
      const upCell = row.getCell(11);
      if (typeof upCell.value === "number") {
        upCell.numFmt = "0%";
        const v = upCell.value;
        upCell.font = { bold: true, color: { argb: v >= 0.95 ? "FF1E7B3A" : v >= 0.8 ? "FF9A5B00" : "FFB3261E" } };
      }
      if (!d.active) row.font = { color: { argb: "FF8E8E93" }, strike: false, italic: true };
      if (last?.answers.dataStatus === "Offline") row.getCell(10).font = { bold: true, color: { argb: "FFB3261E" } };
    });
    const widths = [6, 18, 24, 26, 20, 28, 12, 10, 18, 24, 14, 12, 12];
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    dates.forEach((_, k) => (ws.getColumn(fixed.length + 1 + k).width = 6.5));
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: fixed.length } };
  }

  // ---------- Full inspection log ----------
  const log = wb.addWorksheet("Inspection Log", { properties: { tabColor: { argb: "FF34C759" } }, views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const cols = ["Date", "Time (IST)", "Device Type", "Device ID", "Device Name", "Location", "Engineer", "Data Coming?", "Last Data Received", "Offline Reason", "Remarks / Action Taken", "Late"];
  title(log, "Inspection log", `${db.inspections.length} daily node checks · ${generated}`, cols.length);
  log.addRow([]);
  styleHeader(log.addRow(cols));
  const devById = new Map<string, Device>(db.devices.map((d) => [d.id, d]));
  [...db.inspections]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .forEach((i) => {
      const d = devById.get(i.deviceId);
      const lr = ist(i.answers.lastDataReceived);
      const r = log.addRow([
        i.date,
        ist(i.submittedAt).time,
        d ? DEVICE_TYPES.find((t) => t.key === d.type)?.label : "—",
        i.deviceId,
        d?.name ?? "(deleted)",
        d?.location || "—",
        user(i.engineerId)?.name ?? "—",
        i.answers.dataStatus === "Online" ? "Yes – Online" : "No – Offline",
        `${lr.date} ${lr.time}`,
        i.answers.offlineReason || "—",
        i.remarks || "—",
        i.late ? "Yes" : "No",
      ]);
      const off = i.answers.dataStatus === "Offline";
      r.getCell(8).font = { bold: true, color: { argb: off ? "FFB3261E" : "FF1E7B3A" } };
      r.getCell(8).fill = FILL(off ? "FFFFD6D3" : "FFD1F5DC");
      if (off) r.getCell(10).font = { bold: true, color: { argb: "FFB3261E" } };
      r.getCell(11).alignment = { wrapText: true, vertical: "top" };
      if (i.late) r.getCell(12).font = { bold: true, color: { argb: "FF9A5B00" } };
    });
  [12, 10, 16, 18, 24, 26, 20, 15, 18, 20, 48, 7].forEach((w, k) => (log.getColumn(k + 1).width = w));
  log.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };

  // ---------- Engineers ----------
  const eng = wb.addWorksheet("Engineers", { properties: { tabColor: { argb: "FFAF52DE" } }, views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  title(eng, "Users", generated, 8);
  eng.addRow([]);
  styleHeader(eng.addRow(["Name", "Email", "Role", "Sign-in", "Active Devices", "Checked Today", "Total Inspections", "Joined"]));
  for (const u of db.users) {
    const devs = db.devices.filter((d) => d.engineerId === u.id && d.active);
    eng.addRow([
      u.name,
      u.email,
      u.role === "admin" ? "Administrator" : "Engineer",
      u.provider === "google" ? "Google" : "Email & password",
      devs.length,
      devs.filter((d) => insByDevDay.has(`${d.id}|${today}`)).length,
      db.inspections.filter((i) => i.engineerId === u.id).length,
      ist(u.createdAt).date,
    ]);
  }
  [22, 32, 15, 18, 15, 15, 17, 12].forEach((w, k) => (eng.getColumn(k + 1).width = w));

  return wb;
}

export async function workbookBuffer(db: DB) {
  return Buffer.from(await (await buildWorkbook(db)).xlsx.writeBuffer());
}

export async function writeExcelFile(db: DB) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const buf = await workbookBuffer(db);
  await fs.writeFile(EXCEL_FILE, buf);
}
