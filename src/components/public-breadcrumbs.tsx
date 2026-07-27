import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { SeoBreadcrumbItem } from "@/lib/seo/structured-data";

type PublicBreadcrumbsProps = {
  items: SeoBreadcrumbItem[];
  variant?: "light" | "dark";
};

export function PublicBreadcrumbs({
  items,
  variant = "light",
}: PublicBreadcrumbsProps) {
  const isDark = variant === "dark";

  return (
    <nav
      aria-label="Percorso di navigazione"
      className={`flex min-h-8 items-center text-sm font-semibold ${
        isDark ? "text-white/70" : "text-slate-500"
      }`}
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.path} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className={isDark ? "text-white/40" : "text-slate-300"}
                  size={15}
                />
              ) : null}
              {isLast ? (
                <span
                  aria-current="page"
                  className={`truncate ${
                    isDark ? "text-white" : "text-slate-700"
                  }`}
                >
                  {item.name}
                </span>
              ) : (
                <Link
                  href={item.path}
                  className={`transition hover:underline ${
                    isDark
                      ? "hover:text-white"
                      : "hover:text-green"
                  }`}
                >
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
