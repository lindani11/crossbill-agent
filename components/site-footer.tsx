import { CrossbillMark } from "./logo";

/**
 * components/site-footer.tsx · The footer: tagline, sandbox note and demo video
 *
 * A Server Component. The video link opens YouTube in a new tab: rel="noopener
 * noreferrer" stops that tab from reaching back into this one, and the hidden
 * text tells screen-reader users that a new tab opens.
 */

export default function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-[var(--accent-strong)] bg-[#111827] text-[var(--accent-hover)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs sm:px-6">
        <p className="flex items-center gap-2">
          <CrossbillMark size={22} variant="dark" />
          <span>© 2026 Crossbill · Get paid by overseas clients. Your tax books keep themselves.</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>PayPal sandbox demo · No real money moves</span>
          <a
            href="https://youtu.be/74J9ANQp7qw"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-white underline underline-offset-2 hover:text-[var(--accent-hover)]"
          >
            Watch the demo video
            <span className="sr-only"> (opens YouTube in a new tab)</span>
          </a>
        </p>
      </div>
    </footer>
  );
}
