import Chat from "@/components/chat";
import SiteHeader from "@/components/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader active="chat" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6">
        <Chat />
      </main>
    </>
  );
}
