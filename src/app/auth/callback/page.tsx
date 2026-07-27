import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicNav } from "@/components/public-nav";
import { AuthCallbackClient } from "@/components/auth-callback-client";
import { privatePageRobots } from "@/lib/seo/robots";

export const metadata: Metadata = {
  title: "Verifica account",
  robots: privatePageRobots,
};

export default function AuthCallbackPage() {
  return (
    <main className="min-h-screen bg-paper">
      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="py-16">
          <Suspense fallback={null}>
            <AuthCallbackClient />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
