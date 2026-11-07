import Link from "next/link";
import { CrossbillMark } from "./logo";

type Tab = "chat" | "dashboard" | "statement";

export default function SiteHeader({ active }: { active: Tab }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? "page" : undefined} className="ff-tab">
      {label}
      {on ? <span aria-hidden="true">↗</span> : null}
    </Link>
  );

  return (
    <header className="ff-topbar sticky top-0 z-30">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="Crossbill home" className="flex items-center gap-4 rounded-lg">
          <span className="flex items-center gap-2 text-xl font-black tracking-tight text-[var(--ink)]">
            <CrossbillMark size={36} />
            <span>
              Cross<span className="text-[var(--accent-strong)]">bill</span>
            </span>
          </span>
          <span aria-hidden="true" className="hidden h-6 w-px bg-[var(--line)] sm:block" />
          <span className="ff-eyebrow hidden sm:block">Freelance books</span>
        </Link>
        <nav aria-label="Main" className="no-print flex items-center gap-1">
          {tab("/", "Chat", active === "chat")}
          {tab("/dashboard", "Dashboard", active === "dashboard")}
          {tab("/statement", "Statement", active === "statement")}
        </nav>
      </div>
    </header>
  );
}
