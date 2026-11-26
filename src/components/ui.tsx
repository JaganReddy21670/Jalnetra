"use client";

import clsx from "clsx";
import {
  Activity,
  ArrowDownToLine,
  CloudRain,
  Cpu,
  Droplets,
  FlaskConical,
  Gauge,
  Loader2,
  TestTube,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { deviceType } from "@/lib/devices";

/* ---------- Surfaces ---------- */

export function Card({ className, children, strong }: { className?: string; children: ReactNode; strong?: boolean }) {
  return <div className={clsx(strong ? "glass-strong" : "glass", "rounded-3xl", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5 sm:px-6">
      <div>
        <h3 className="text-[17px] font-semibold tracking-[-0.02em] text-ios-label">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ios-gray">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="animate-rise">
        <h1 className="large-title">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ios-gray">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Badges ---------- */

type Tone = "green" | "orange" | "red" | "gray" | "blue" | "yellow" | "purple";
const tones: Record<Tone, string> = {
  green: "bg-ios-green/15 text-[#248A3D]",
  orange: "bg-ios-orange/15 text-[#C93400]",
  red: "bg-ios-red/12 text-[#D70015]",
  gray: "bg-ios-fill text-[#636366]",
  blue: "bg-ios-blue/12 text-ios-blueDark",
  yellow: "bg-ios-yellow/25 text-[#A05A00]",
  purple: "bg-ios-purple/12 text-[#8944AB]",
};
const dots: Record<Tone, string> = {
  green: "bg-ios-green",
  orange: "bg-ios-orange",
  red: "bg-ios-red",
  gray: "bg-ios-gray",
  blue: "bg-ios-blue",
  yellow: "bg-ios-yellow",
  purple: "bg-ios-purple",
};

export function Badge({ tone = "gray", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold", tones[tone], className)}>
      {dot && <span className={clsx("h-1.5 w-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

export type DayState = "healthy" | "issue" | "late" | "pending" | "missed";
export const dayMeta: Record<DayState, { label: string; tone: Tone }> = {
  healthy: { label: "Online", tone: "green" },
  issue: { label: "Offline", tone: "red" },
  late: { label: "Checked late", tone: "orange" },
  pending: { label: "Not checked", tone: "yellow" },
  missed: { label: "Missed", tone: "red" },
};
export function DayBadge({ state }: { state: DayState }) {
  return (
    <Badge tone={dayMeta[state].tone} dot>
      {dayMeta[state].label}
    </Badge>
  );
}

/* ---------- Device icon (iOS app-icon style) ---------- */

const ICONS = {
  water_level: Waves,
  retrofit: Gauge,
  borewell: ArrowDownToLine,
  current: Zap,
  rain_gauge: CloudRain,
  tds: FlaskConical,
  flow: Droplets,
  ph: TestTube,
  pressure: Activity,
  other: Cpu,
} as const;

export function DeviceIcon({ type, size = 40, className }: { type: string; size?: number; className?: string }) {
  const t = deviceType(type);
  const Icon = ICONS[t.key as keyof typeof ICONS] ?? Cpu;
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center text-white shadow-pill", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(160deg, ${t.color}E6, ${t.color})`,
      }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
    </span>
  );
}

/* ---------- Controls ---------- */

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading,
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "plain" | "danger" | "dark"; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition duration-200 active:scale-[0.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-ios-blue/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        size === "sm" && "h-8 px-3.5 text-[13px]",
        size === "md" && "h-10 px-5 text-[15px]",
        size === "lg" && "h-12 px-6 text-[17px]",
        variant === "primary" && "bg-ios-blue text-white shadow-[0_4px_14px_rgba(0,122,255,0.35)] hover:bg-ios-blueDark",
        variant === "dark" && "bg-ios-label text-white hover:bg-black",
        variant === "secondary" && "bg-white/70 text-ios-blue ring-1 ring-black/5 backdrop-blur hover:bg-white",
        variant === "plain" && "text-ios-blue hover:bg-ios-blue/10",
        variant === "danger" && "bg-ios-red text-white hover:bg-[#D70015]",
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export const inputCls =
  "w-full h-11 rounded-xl border-0 bg-white/70 px-3.5 text-[15px] text-ios-label ring-1 ring-black/[0.06] placeholder:text-ios-gray/80 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-ios-blue/60";

export const textareaCls =
  "w-full rounded-xl border-0 bg-white/70 px-3.5 py-2.5 text-[15px] text-ios-label ring-1 ring-black/[0.06] placeholder:text-ios-gray/80 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-ios-blue/60";

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[#3C3C43]">
        {label}
        {required && <span className="ml-0.5 text-ios-red">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1.5 block text-[12px] text-ios-red">{error}</span> : hint ? <span className="mt-1.5 block text-[12px] text-ios-gray">{hint}</span> : null}
    </label>
  );
}

/** iOS segmented control. The first option is treated as the "good" answer (green); others red. */
export function Segmented<T extends string>({ value, options, onChange, neutral }: { value: T | ""; options: readonly T[]; onChange: (v: T) => void; neutral?: boolean }) {
  return (
    <div className="flex w-full rounded-[11px] bg-ios-fill p-[3px]">
      {options.map((o, i) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={clsx(
              "flex-1 whitespace-nowrap rounded-[8px] px-2 py-[7px] text-[13px] font-semibold transition-all duration-200",
              active ? "bg-white shadow-pill" : "text-[#3C3C43] hover:text-ios-label",
              active && !neutral && (i === 0 ? "text-[#248A3D]" : "text-[#D70015]"),
              active && neutral && "text-ios-label",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200", checked ? "bg-ios-green" : "bg-ios-fill")}
    >
      <span className={clsx("absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-pill transition-all duration-200", checked ? "left-[22px]" : "left-[2px]")} />
    </button>
  );
}

export function ProgressBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  const c = color ?? (value >= 100 ? "#34C759" : value >= 60 ? "#007AFF" : value >= 30 ? "#FF9500" : "#FF3B30");
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-ios-fill", className)}>
      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: c }} />
    </div>
  );
}

export function ProgressRing({ value, size = 148, stroke = 14, label, sub }: { value: number; size?: number; stroke?: number; label?: string; sub?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 100 ? "#34C759" : value >= 60 ? "#007AFF" : value >= 30 ? "#FF9500" : "#FF3B30";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(120,120,128,0.14)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (Math.min(100, value) / 100) * c}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[34px] font-bold tabular-nums tracking-[-0.03em] text-ios-label">{value}%</span>
        {label && <span className="text-[12px] font-medium text-ios-gray">{label}</span>}
        {sub && <span className="text-[11px] text-ios-gray">{sub}</span>}
      </div>
    </div>
  );
}

export function Avatar({ name, picture, size = 36 }: { name: string; picture?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (picture)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover ring-2 ring-white/80" style={{ width: size, height: size }} />;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#A1A1AA] to-[#71717A] font-semibold text-white ring-2 ring-white/80"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

/** Bottom sheet on mobile, centred card on desktop. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="glass-strong max-h-[92vh] w-full animate-rise overflow-hidden rounded-t-[28px] bg-white/85 shadow-float sm:max-w-lg sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-black/15 sm:hidden" />
        <div className="flex items-center justify-between px-6 pb-2 pt-4">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">{title}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-ios-fill text-ios-gray hover:text-ios-label" aria-label="Close">
            <X className="h-4 w-4" strokeWidth={2.6} />
          </button>
        </div>
        <div className="max-h-[calc(92vh-150px)] overflow-y-auto px-6 pb-4 pt-2">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 pb-6 pt-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-[17px] font-semibold text-ios-label">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-[15px] text-ios-gray">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("h-6 w-6 animate-spin text-ios-gray", className)} />;
}

/** Grouped list rows, iOS Settings style. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={clsx("divide-y divide-ios-separator", className)}>{children}</ul>;
}
