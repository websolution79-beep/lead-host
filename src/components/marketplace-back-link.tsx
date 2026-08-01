"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function MarketplaceBackLink() {
  const pathname = usePathname();
  const href = pathname.startsWith("/admin/marketplace")
    ? "/admin/marketplace"
    : "/app/marketplace";

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm font-semibold text-green"
    >
      <ArrowLeft size={16} />
      Torna al marketplace
    </Link>
  );
}
