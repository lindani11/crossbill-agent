import Chat from "@/components/chat";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Crossbill</h1>
          <p className="text-sm text-[var(--muted)]">Get paid by overseas clients. You approve every send.</p>
        </div>
        <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]">
          PayPal sandbox
        </span>
      </header>
      <Chat />
    </main>
  );
}
