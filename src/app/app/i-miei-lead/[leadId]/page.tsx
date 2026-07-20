import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MyLeadDetail } from "@/components/my-lead-detail";

type MyLeadDetailPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

export default async function MyLeadDetailPage({
  params,
}: MyLeadDetailPageProps) {
  const { leadId } = await params;

  return (
    <AppShell section="pm" eyebrow="I miei lead" title="Dettaglio lead">
      <div className="mb-5">
        <Link
          href="/app/i-miei-lead"
          className="inline-flex items-center gap-2 text-sm font-semibold text-green"
        >
          <ArrowLeft size={16} />
          Torna ai miei lead
        </Link>
      </div>
      <MyLeadDetail leadId={leadId} />
    </AppShell>
  );
}
