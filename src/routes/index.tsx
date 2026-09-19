import { createFileRoute } from "@tanstack/react-router";
import { IkhosDashboard } from "@/components/ikhos-dashboard";
import { IkhosOnboarding } from "@/components/ikhos-onboarding";
import { IkhosLanguageProvider } from "@/lib/ikhos-language";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ikhos AI — Never Miss a Word That Matters." },
      { name: "description", content: "Never Miss a Word That Matters. Real-time acoustic isolation, accessible live translation, and ADA compliance telemetry for public venues." },
      { property: "og:title", content: "Ikhos AI — Never Miss a Word That Matters." },
      { property: "og:description", content: "Real-time acoustic isolation, accessible live translation, and ADA compliance telemetry for public venues." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <IkhosLanguageProvider>
      <IkhosOnboarding />
      <IkhosDashboard />
    </IkhosLanguageProvider>
  );
}
