import Chat from "@/components/chat";
import SiteHeader from "@/components/site-header";
import { exampleRecipients } from "@/lib/recipients";

/**
 * app/page.tsx · "/", the Chat page
 *
 * A Server Component, rendered on the server where the env vars are (at build
 * time, as the page is static). The browser gets only the sandbox test emails
 * that the example prompts need.
 *
 *   <SiteHeader> → <main id="main"> → <Chat testEmails> (components/chat.tsx)
 */

export default function Home() {
  return (
    <>
      <SiteHeader active="chat" />
      <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6">
        <Chat testEmails={exampleRecipients()} />
      </main>
    </>
  );
}
