"use client";

import clsx from "clsx";
import { CheckCircle2, WifiOff } from "lucide-react";
import { Badge } from "./ui";
import type { Inspection } from "@/lib/devices";
import { fmtDateTime } from "@/lib/format";

export function SubmittedView({ ins }: { ins: Inspection }) {
  const a = ins.answers;
  const online = a.dataStatus === "Online";
  const rows: [string, string, boolean][] = [
    ["Data coming?", online ? "Yes – online" : "No – offline", online],
    ["Last data received", fmtDateTime(a.lastDataReceived), true],
    ...(online ? [] : ([["Reason", a.offlineReason, false]] as [string, string, boolean][])),
  ];
  return (
    <div className="space-y-4">
      <div className={clsx("flex items-center gap-2 rounded-2xl p-3 text-[14px] font-medium", online ? "bg-ios-green/12 text-[#248A3D]" : "bg-ios-red/10 text-[#D70015]")}>
        {online ? <CheckCircle2 className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
        Checked {fmtDateTime(ins.submittedAt)}
        {ins.late && <Badge tone="orange" className="ml-auto">Late</Badge>}
      </div>
      <ul className="divide-y divide-ios-separator rounded-2xl bg-white/70 ring-1 ring-black/[0.05]">
        {rows.map(([k, v, ok]) => (
          <li key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
            <span className="text-ios-gray">{k}</span>
            <span className={clsx("text-right font-semibold", ok ? "text-ios-label" : "text-[#D70015]")}>{v}</span>
          </li>
        ))}
      </ul>
      {ins.remarks && (
        <p className="text-[15px]">
          <span className="text-ios-gray">{online ? "Remarks: " : "Action taken / remarks: "}</span>
          {ins.remarks}
        </p>
      )}
    </div>
  );
}
