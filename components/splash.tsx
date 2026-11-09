"use client";

import { useEffect, useState } from "react";

/** The logo finishes drawing at about this point after the page starts loading. */
const MIN_MS = 1900;
/** Never hold the app back longer than this, however slow the network. */
const MAX_MS = 7000;

/**
 * components/splash.tsx · The landing animation
 *
 * Shown on every full visit or refresh (not on in-app navigation). It is part
 * of the server HTML and animated with CSS only, so it paints at once, even
 * before the JavaScript arrives on a slow connection. It stays up until the
 * page has loaded (and the logo has drawn), then fades out. If JavaScript
 * never runs, CSS hides it after 7 seconds.
 *
 *   app/layout.tsx → <Splash> → the .cb-* styles in app/globals.css
 *   phase: "on" → (page loaded and logo drawn) → "leaving" (fade) → "gone"
 */
export default function Splash() {
  const [phase, setPhase] = useState<"on" | "leaving" | "gone">("on");

  useEffect(() => {
    const timers: number[] = [];
    let left = false;
    // Fade out once, then take the overlay out of the page after the fade.
    const leave = () => {
      if (left) return;
      left = true;
      setPhase("leaving");
      timers.push(window.setTimeout(() => setPhase("gone"), 450));
    };
    // performance.now() counts from the start of page load, like the CSS animation.
    const afterLoad = () => timers.push(window.setTimeout(leave, Math.max(0, MIN_MS - performance.now())));

    // The page may have finished loading before React ran this effect.
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    // Safety net: leave after MAX_MS even if "load" never fires.
    timers.push(window.setTimeout(leave, Math.max(0, MAX_MS - performance.now())));

    // Cleanup: if the splash unmounts first, cancel the listener and the timers.
    return () => {
      window.removeEventListener("load", afterLoad);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // aria-hidden below: the splash is decoration, so screen readers skip it.
  if (phase === "gone") return null;

  return (
    <div aria-hidden="true" className={`cb-splash no-print${phase === "leaving" ? " cb-splash-leave" : ""}`}>
      <svg width="112" height="112" viewBox="0 0 64 64" className="cb-s-mark">
        <circle className="cb-s-globe" cx="24" cy="32" r="16" fill="#111827" />
        <g className="cb-s-grid" fill="none" stroke="#ffffff" strokeWidth="0.8">
          <ellipse cx="24" cy="32" rx="8" ry="16" />
          <ellipse cx="24" cy="32" rx="13.86" ry="16" />
          <path d="M16 45.86 H32 M10.14 40 H37.86 M8 32 H40 M10.14 24 H37.86 M16 18.14 H32" />
        </g>
        {/* pathLength={1} lets CSS draw any path with stroke-dashoffset 1 → 0, whatever its real length. */}
        <path
          className="cb-s-draw"
          style={{ animationDelay: "0.35s" }}
          pathLength={1}
          d="M30.2 22.8 C 27.7 20.3, 17.9 20.3, 17.9 26.5 C 17.9 32, 30.2 31.4, 30.2 37.5 C 30.2 43.7, 20.3 43.7, 17.9 41.2"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path className="cb-s-draw" style={{ animationDelay: "0.4s" }} pathLength={1} d="M24 18.5 V45.5" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
        <path className="cb-s-draw" style={{ animationDelay: "0.4s" }} pathLength={1} d="M24 12.5 V15.5" stroke="#111827" strokeWidth="3.2" strokeLinecap="round" />
        <path className="cb-s-draw" style={{ animationDelay: "0.4s" }} pathLength={1} d="M24 48.5 V51.5" stroke="#111827" strokeWidth="3.2" strokeLinecap="round" />
        <path className="cb-s-draw" style={{ animationDelay: "0.65s" }} pathLength={1} d="M36 24 C 46 25, 53 31, 59 42" stroke="#0369a1" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <path className="cb-s-draw" style={{ animationDelay: "0.75s" }} pathLength={1} d="M36 40 C 46 39, 53 33, 59 22" stroke="#38bdf8" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <g className="cb-s-eye">
          <circle cx="13" cy="26" r="2.9" fill="#111827" />
          <circle cx="13" cy="26" r="1.9" fill="#ffffff" />
        </g>
      </svg>
      <p className="cb-s-word text-4xl font-black tracking-tight text-[var(--ink)]">
        Cross<span className="text-[var(--accent-strong)]">bill</span>
      </p>
      {/* Only appears if loading takes longer than the animation. */}
      <span className="cb-s-wait ff-spinner" />
    </div>
  );
}
