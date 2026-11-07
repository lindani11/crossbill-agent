/**
 * The Crossbill mark: a globe-shaped bird head with a crossed beak.
 * "light" sits on white or cream; "dark" sits on the dark footer.
 */
const COLORS = {
  light: { globe: "#0369a1", grid: "#ffffff", upper: "#0369a1", lower: "#38bdf8", eyeRing: "#0369a1", eye: "#ffffff" },
  dark: { globe: "#38bdf8", grid: "#111827", upper: "#ffffff", lower: "#38bdf8", eyeRing: "#38bdf8", eye: "#111827" },
} as const;

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
      <circle cx="22" cy="32" r="13" fill={c.globe} />
      <g fill="none" stroke={c.grid} strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
        <ellipse cx="22" cy="32" rx="5.5" ry="13" />
        <ellipse cx="22" cy="32" rx="10" ry="13" />
        <path d="M22 19 V45" />
        <path d="M9 32 H35" />
        <path d="M10.9 25.5 Q22 28.3 33.1 25.5" />
        <path d="M10.9 38.5 Q22 41.3 33.1 38.5" />
      </g>
      <path d="M31 23 C 42 24, 50 30, 56 41" stroke={c.upper} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M31 41 C 42 40, 50 34, 56 23" stroke={c.lower} strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="19.5" cy="28" r="3.6" fill={c.eyeRing} />
      <circle cx="19.5" cy="28" r="2.4" fill={c.eye} />
    </svg>
  );
}
