import Link from "next/link";
import { CrossbillMark } from "./logo";

/**
 * components/site-header.tsx · The top bar: skip link, logo and the three tabs
 *
 * A Server Component (no "use client"): plain links, no JavaScript needed.
 * aria-current="page" marks the active tab for screen readers, and styles it.
 */

type Tab = "chat" | "dashboard" | "statement";

export default function SiteHeader({ active }: { active: Tab }) {
  // One tab; the active one gets aria-current, and an arrow from tablet size up.
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? "page" : undefined} className="ff-tab">
      {label}
      {on ? <span aria-hidden="true" className="hidden sm:inline">↗</span> : null}
    </Link>
  );

  return (
    <>
      {/* The first thing a keyboard user reaches: jumps past the header to <main id="main">. */}
      <a href="#main" className="ff-skip">
        Skip to content
      </a>
      <header className="ff-topbar sticky top-0 z-30">
        {/* One slim row at every width: 48 px on phones, 56 px from tablet size up. */}
        <div className="mx-auto flex min-h-12 w-full max-w-6xl items-center justify-between gap-2 px-3 py-1.5 sm:min-h-14 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-4 rounded-lg">
            <span className="flex items-center gap-1.5 text-lg font-black tracking-tight text-[var(--ink)] sm:gap-2 sm:text-xl">
              <CrossbillMark size={30} />
              {/* On the narrowest phones only the mark shows; the name stays for screen readers. */}
              <span className="max-[379px]:sr-only">
                Cross<span className="text-[var(--accent-strong)]">bill</span>
              </span>
            </span>
            <span aria-hidden="true" className="hidden h-6 w-px bg-[var(--line)] sm:block" />
            <span className="ff-eyebrow hidden sm:block">Freelance books</span>
          </Link>
          <nav aria-label="Main" className="no-print flex items-center gap-0.5 sm:gap-1">
            {tab("/", "Chat", active === "chat")}
            {tab("/dashboard", "Dashboard", active === "dashboard")}
            {tab("/statement", "Statement", active === "statement")}
          </nav>
        </div>
      </header>
    </>
  );
}
