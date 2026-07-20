import { AppShell } from "@/components/app-shell";
import { MyLeadsCenter } from "@/components/my-leads-center";

export default function MyLeadsPage() {
  return (
    <AppShell section="pm" eyebrow="I miei lead" title="Contatti sbloccati">
      <MyLeadsCenter />
    </AppShell>
  );
}
