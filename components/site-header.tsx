import Link from "next/link";

type Tab = "chat" | "dashboard" | "statement";

export default function SiteHeader({ active }: { active: Tab }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-sm ${
        on
          ? "bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
          : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Crossbill</h1>
        <p className="text-sm text-[var(--muted)]">Get paid by overseas clients. Your tax books keep themselves.</p>
      </div>
      <nav className="no-print flex items-center gap-1 rounded-full border border-[var(--line)] p-1">
        {tab("/", "Chat", active === "chat")}
        {tab("/dashboard", "Dashboard", active === "dashboard")}
        {tab("/statement", "Statement", active === "statement")}
      </nav>
    </header>
  );
}
