import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

type PublicNavProps = {
  variant?: "light" | "dark";
};

export function PublicNav({ variant = "light" }: PublicNavProps) {
  const isDark = variant === "dark";

  return (
    <header className="flex items-center justify-between gap-4">
      <BrandLogo variant={isDark ? "dark" : "light"} />
      <Link
        href="/login"
        className={`inline-flex shrink-0 ${
          isDark ? "btn btn-secondary-dark" : "btn btn-secondary"
        }`}
      >
        Accedi
      </Link>
    </header>
  );
}
