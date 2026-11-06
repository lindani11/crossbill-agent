import Chat from "@/components/chat";
import SiteHeader from "@/components/site-header";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <SiteHeader active="chat" />
      <Chat />
    </main>
  );
}
