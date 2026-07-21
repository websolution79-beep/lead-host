import type { Metadata } from "next";
import { OwnerRequestForm } from "@/components/owner-request-form";

export const metadata: Metadata = {
  title: "Richiesta proprietario",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OwnerRequestEmbedPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4 sm:py-4">
        <OwnerRequestForm variant="embed" />
      </div>
    </main>
  );
}
