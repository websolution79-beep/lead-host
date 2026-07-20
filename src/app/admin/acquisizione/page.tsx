import { AcquisitionAdminConsole } from "@/components/acquisition-admin-console";
import { AppShell } from "@/components/app-shell";
import { getEnv } from "@/lib/env";

type AcquisitionPageProps = {
  searchParams: Promise<{
    tab?: string;
  }>;
};

export default async function AcquisitionPage({
  searchParams,
}: AcquisitionPageProps) {
  const { tab } = await searchParams;
  const appUrl = getEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3002";

  return (
    <AppShell section="admin" eyebrow="Acquisizione" title="Canali lead">
      <AcquisitionAdminConsole
        initialTab={tab}
        metaEndpointUrl={`${appUrl.replace(/\/$/, "")}/api/webhooks/meta/leadgen`}
        metaConfig={{
          appId: Boolean(getEnv("META_APP_ID")),
          appSecret: Boolean(getEnv("META_APP_SECRET")),
          verifyToken: Boolean(getEnv("META_VERIFY_TOKEN")),
          systemUserAccessToken: Boolean(getEnv("META_SYSTEM_USER_ACCESS_TOKEN")),
        }}
      />
    </AppShell>
  );
}
