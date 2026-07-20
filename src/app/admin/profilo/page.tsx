import { AppShell } from "@/components/app-shell";
import { ProfileCenter } from "@/components/profile-center";

export default function AdminProfilePage() {
  return (
    <AppShell section="admin" eyebrow="Account" title="Profilo Super Admin">
      <ProfileCenter />
    </AppShell>
  );
}
