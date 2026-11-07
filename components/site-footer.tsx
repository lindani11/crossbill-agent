import { CrossbillMark } from "./logo";

export default function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t-2 border-[var(--accent-strong)] bg-[#111827] text-[var(--accent-hover)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs sm:px-6">
        <p className="flex items-center gap-2">
          <CrossbillMark size={22} variant="dark" />
          <span>© 2026 Crossbill · Get paid by overseas clients. Your tax books keep themselves.</span>
        </p>
        <p>PayPal sandbox demo · No real money moves</p>
      </div>
    </footer>
  );
}
