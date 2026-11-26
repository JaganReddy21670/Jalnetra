import clsx from "clsx";
import { useId } from "react";

/**
 * JalNetra mark: an eye ("netra") whose pupil is a water drop ("jal"),
 * on a blue→teal tile with a gentle wave. `animated` adds blink, floating drop and moving wave.
 */
export function Logo({ size = 40, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="JalNetra"
      className={clsx("shrink-0", animated && "jn-animated", className)}
      style={{ filter: "drop-shadow(0 6px 14px rgba(0,122,255,0.35))" }}
    >
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3DC6FF" />
          <stop offset="55%" stopColor="#007AFF" />
          <stop offset="100%" stopColor="#1E5BDB" />
        </linearGradient>
        <linearGradient id={`drop${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5AC8FA" />
          <stop offset="100%" stopColor="#0A60D6" />
        </linearGradient>
        <clipPath id={`tile${id}`}>
          <rect width="64" height="64" rx="18" />
        </clipPath>
      </defs>

      <g clipPath={`url(#tile${id})`}>
        <rect width="64" height="64" fill={`url(#bg${id})`} />
        {/* moving wave along the bottom (twice as wide so it can loop) */}
        <g className="jn-wave">
          <path d="M0 50 Q8 46 16 50 T32 50 T48 50 T64 50 T80 50 T96 50 T112 50 T128 50 V64 H0 Z" fill="#fff" opacity="0.16" />
          <path d="M0 55 Q8 51 16 55 T32 55 T48 55 T64 55 T80 55 T96 55 T112 55 T128 55 V64 H0 Z" fill="#fff" opacity="0.12" />
        </g>
      </g>

      {/* the eye */}
      <g className="jn-eye">
        <path d="M9 31 C18 17 46 17 55 31 C46 45 18 45 9 31 Z" fill="#fff" />
        {/* water-drop pupil */}
        <g className="jn-drop">
          <path d="M32 21.5 C32 21.5 25 29.5 25 34 a7 7 0 0 0 14 0 C39 29.5 32 21.5 32 21.5 Z" fill={`url(#drop${id})`} />
          <ellipse cx="29.4" cy="32.6" rx="1.7" ry="2.6" fill="#fff" opacity="0.85" />
        </g>
      </g>
    </svg>
  );
}
