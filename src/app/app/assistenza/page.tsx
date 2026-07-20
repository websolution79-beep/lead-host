import { AppShell } from "@/components/app-shell";
import { SupportCenter } from "@/components/support-center";

export default function SupportPage() {
  return (
    <AppShell section="pm" eyebrow="Assistenza" title="Assistenza">
      <SupportCenter />
    </AppShell>
  );
}
