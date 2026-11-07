/**
 * The Crossbill mark: a globe-shaped bird head with a crossed beak.
 * The grid is a true globe view (meridians every 30°, parallels at 0°, ±30°
 * and ±60°), and the central meridian bends into an S to draw a $.
 * The globe matches the "Cross" wordmark: ink on light backgrounds (with
 * white grid lines), white on the dark footer.
 */
const COLORS = {
  light: { globe: "#111827", line: "#ffffff", stem: "#111827", upper: "#0369a1", lower: "#38bdf8", eye: "#ffffff" },
  dark: { globe: "#ffffff", line: "#111827", stem: "#ffffff", upper: "#ffffff", lower: "#38bdf8", eye: "#111827" },
} as const;

const DOLLAR_S =
  "M30.2 22.8 C 27.7 20.3, 17.9 20.3, 17.9 26.5 C 17.9 32, 30.2 31.4, 30.2 37.5 C 30.2 43.7, 20.3 43.7, 17.9 41.2";

export function CrossbillMark({
  size = 32,
  variant = "light",
  title,
}: {
  size?: number;
  variant?: keyof typeof COLORS;
  title?: string;
}) {
  const c = COLORS[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <circle cx="24" cy="32" r="16" fill={c.globe} />
      <g fill="none" stroke={c.line} strokeWidth="0.8" opacity="0.6">
        <ellipse cx="24" cy="32" rx="8" ry="16" />
        <ellipse cx="24" cy="32" rx="13.86" ry="16" />
        <path d="M16 45.86 H32" />
        <path d="M10.14 40 H37.86" />
        <path d="M8 32 H40" />
        <path d="M10.14 24 H37.86" />
        <path d="M16 18.14 H32" />
      </g>
      <path d={DOLLAR_S} fill="none" stroke={c.line} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M24 18.5 V45.5" stroke={c.line} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M24 12.5 V15.5 M24 48.5 V51.5" stroke={c.stem} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M36 24 C 46 25, 53 31, 59 42" stroke={c.upper} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M36 40 C 46 39, 53 33, 59 22" stroke={c.lower} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx="13" cy="26" r="2.9" fill={c.globe} />
      <circle cx="13" cy="26" r="1.9" fill={c.eye} />
    </svg>
  );
}
