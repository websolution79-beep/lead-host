import LeadDetailPage from "@/app/app/marketplace/[leadId]/page";

export const dynamic = "force-dynamic";

type AdminLeadDetailPageProps = {
  params: Promise<{ leadId: string }>;
};

export default function AdminLeadDetailPage(props: AdminLeadDetailPageProps) {
  return <LeadDetailPage {...props} adminMarketplaceView />;
}
