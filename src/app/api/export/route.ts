import { requireUser } from "@/server/auth";
import { readDB } from "@/server/db";
import { workbookBuffer } from "@/server/excel";
import { istParts } from "@/lib/format";
import { APP_SLUG } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Administrator-only download of the full Excel workbook (one sub-sheet per device type). */
export async function GET() {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const buf = await workbookBuffer(await readDB());
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${APP_SLUG}-Devices-${istParts(new Date()).date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
