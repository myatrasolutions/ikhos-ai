import { createFileRoute } from "@tanstack/react-router";
import { IkhosDashboard } from "@/components/ikhos-dashboard";
import { MemberBEnginePanel } from "@/components/member-b-engine-panel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ikhos AI — Live Acoustic Isolation & Translation" },
      { name: "description", content: "Real-time acoustic isolation, accessible live translation, and ADA compliance telemetry for public venues." },
      { property: "og:title", content: "Ikhos AI — Live Acoustic Isolation & Translation" },
      { property: "og:description", content: "Real-time acoustic isolation, accessible live translation, and ADA compliance telemetry for public venues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <>
      <IkhosDashboard />
      <MemberBEnginePanel />
    </>
  );
}
