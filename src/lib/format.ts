const TZ = "Asia/Kolkata";

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00+05:30`) : new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}

export function fmtAge(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Current time parts in IST, independent of the viewer's timezone. */
export function istParts(d: Date) {
  const s = d.toLocaleString("en-GB", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  // "26/11/2026, 15:42:10"
  const [date, time] = s.split(", ");
  const [dd, mm, yyyy] = date.split("/");
  const [h, m, sec] = time.split(":").map(Number);
  return { date: `${yyyy}-${mm}-${dd}`, h, m, s: sec, minutes: h * 60 + m };
}

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
