import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LeadHostProGuide } from "@/components/leadhostpro-guide";

export const metadata: Metadata = {
  title: "Guida LeadHostPro | Lead Host",
  description: "Collega leadhostpro.it al CRM del Modulo Marketing di Lead Host.",
  robots: { index: false, follow: false },
};

export default function MarketingIntegrationGuidePage() {
  return <AppShell section="pm" eyebrow="Marketing / Integrazioni" title="Guida LeadHostPro">
    <Link href="/app/marketing/integrazioni" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-green"><ArrowLeft size={17} />Torna alle Integrazioni</Link>
    <LeadHostProGuide />
  </AppShell>;
}
