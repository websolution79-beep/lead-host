import type { Metadata } from "next";
import { OwnerRequestEmbedShell } from "@/components/owner-request-embed-shell";
import { OwnerRequestForm } from "@/components/owner-request-form";
import { privatePageRobots } from "@/lib/seo/robots";

export const metadata: Metadata = {
  title: "Richiesta proprietario",
  robots: privatePageRobots,
};

export default function OwnerRequestEmbedPage() {
  return (
    <OwnerRequestEmbedShell>
      <OwnerRequestForm variant="embed" />
    </OwnerRequestEmbedShell>
  );
}
