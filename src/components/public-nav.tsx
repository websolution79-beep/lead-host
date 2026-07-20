import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { MobileMenu } from "@/components/mobile-menu";

type PublicNavProps = {
  variant?: "light" | "dark";
};

export function PublicNav({ variant = "light" }: PublicNavProps) {
  const isDark = variant === "dark";
  const links = [
    { href: "/proprietari", label: "Proprietari" },
    { href: "/property-manager", label: "Property Manager" },
    { href: "/app/marketplace", label: "Marketplace" },
    { href: "/admin", label: "Admin" },
    { href: "/login", label: "Accedi" },
  ];

  return (
    <header className="flex items-center justify-between gap-6">
      <BrandLogo variant={isDark ? "dark" : "light"} />
      <nav
        className={`hidden items-center gap-7 text-sm font-semibold md:flex ${
          isDark ? "text-cream/86" : "text-muted"
        }`}
      >
        <Link href="/proprietari">Proprietari</Link>
        <Link href="/property-manager">Property Manager</Link>
        <Link href="/app/marketplace">Marketplace</Link>
        <Link href="/admin">Admin</Link>
      </nav>
      <Link
        href="/login"
        className={`hidden md:inline-flex ${
          isDark ? "btn btn-secondary-dark" : "btn btn-secondary"
        }`}
      >
        Accedi
      </Link>
      <MobileMenu links={links} variant={isDark ? "dark" : "light"} />
    </header>
  );
}
