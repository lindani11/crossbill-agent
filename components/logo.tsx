/**
 * components/logo.tsx · The Crossbill mark, drawn as inline SVG
 *
 * A globe-shaped bird head with a crossed beak.
 * The grid is a true globe view (meridians every 30°, parallels at 0°, ±30°
 * and ±60°), and the central meridian bends into an S to draw a $.
 * The globe matches the "Cross" wordmark: ink on light backgrounds (with
 * white grid lines), white on the dark footer.
 *
 * The header shows the 3D mark (CrossbillMark3D); the footer keeps the flat
 * white one, which reads better that small on dark. The splash (components/splash.tsx),
 * public/offline.html and public/crossbill-logo.svg carry copies of the same
 * paths, on a 64 × 64 grid.
 */

// Two colour sets: "light" for white backgrounds, "dark" for the footer.
const COLORS = {
  light: { globe: "#111827", line: "#ffffff", stem: "#111827", upper: "#0369a1", lower: "#38bdf8", eye: "#ffffff" },
  dark: { globe: "#ffffff", line: "#111827", stem: "#ffffff", upper: "#ffffff", lower: "#38bdf8", eye: "#111827" },
} as const;

// The S of the $: three cubic Bézier curves (the C commands).
const DOLLAR_S =
  "M30.2 22.8 C 27.7 20.3, 17.9 20.3, 17.9 26.5 C 17.9 32, 30.2 31.4, 30.2 37.5 C 30.2 43.7, 20.3 43.7, 17.9 41.2";

/** With a title it is an image with that name; without one it is decoration, hidden from screen readers. */
export function CrossbillMark({
  size = 32,
  variant = "light",
  title,
}: {
  size?: number;
  variant?: keyof typeof COLORS;
  title?: string;
}) {
  if (variant === "light") return <CrossbillMark3D size={size} title={title} />;
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

/**
 * The 3D (skeuomorphic) mark, used on light backgrounds: a glossy ink globe
 * lit from the top left, a silver $ with a soft inner shadow, and a crossed
 * beak in two blues with a thin highlight. Same geometry as the flat mark.
 * Gradient ids include the size, so two marks on one page never share ids.
 */
function CrossbillMark3D({ size, title }: { size: number; title?: string }) {
  const id = (name: string) => `cb3d-${size}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={id("globe")} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" stopColor="#5b6577" />
          <stop offset="0.45" stopColor="#1f2937" />
          <stop offset="1" stopColor="#030712" />
        </radialGradient>
        <radialGradient id={id("spec")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("silver")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e5e7eb" />
          <stop offset="1" stopColor="#9ca3af" />
        </linearGradient>
        <linearGradient id={id("up")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#0369a1" />
          <stop offset="1" stopColor="#0c4a6e" />
        </linearGradient>
        <linearGradient id={id("lo")} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="0.5" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <circle cx="24" cy="32" r="16" />
        </clipPath>
        <filter id={id("shadow")} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.2" floodColor="#0c1a2b" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter={url("shadow")}>
        <path d="M36 24 C 46 25, 53 31, 59 42" stroke={url("up")} strokeWidth="3.8" strokeLinecap="round" fill="none" />
        <path d="M36.4 23.3 C 46 24.4, 52.6 30.2, 58.4 40.6" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.7" strokeLinecap="round" fill="none" />
        <circle cx="24" cy="32" r="16" fill={url("globe")} />
        <g clipPath={url("clip")} fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.32">
          <ellipse cx="24" cy="32" rx="8" ry="16" />
          <ellipse cx="24" cy="32" rx="13.86" ry="16" />
          <path d="M16 45.86 H32 M10.14 40 H37.86 M8 32 H40 M10.14 24 H37.86 M16 18.14 H32" />
        </g>
        {/* A dark copy 0.8 below the $ gives it depth. */}
        <path d={DOLLAR_S} transform="translate(0 0.8)" fill="none" stroke="#000000" strokeOpacity="0.45" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M24 19.3 V46.3" stroke="#000000" strokeOpacity="0.45" strokeWidth="3.4" strokeLinecap="round" />
        <path d={DOLLAR_S} fill="none" stroke={url("silver")} strokeWidth="3.2" strokeLinecap="round" />
        {/* Solid, not a gradient: a gradient sized to a zero-width line draws nothing. */}
        <path d="M24 18.5 V45.5" stroke="#eceef2" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M24 12.5 V15.5 M24 48.5 V51.5" stroke="#1f2937" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M36 40 C 46 39, 53 33, 59 22" stroke={url("lo")} strokeWidth="3.8" strokeLinecap="round" fill="none" />
        <path d="M36.4 39.2 C 46 38.2, 52.4 32.6, 58.2 22.6" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.7" strokeLinecap="round" fill="none" />
        <circle cx="13" cy="26" r="3" fill="#030712" />
        <circle cx="13" cy="26" r="2" fill="#f8fafc" />
        <circle cx="12.4" cy="25.3" r="0.65" fill="#ffffff" />
        <ellipse cx="18.5" cy="22.5" rx="8" ry="4.2" transform="rotate(-24 18.5 22.5)" fill={url("spec")} />
      </g>
    </svg>
  );
}
