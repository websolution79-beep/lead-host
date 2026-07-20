"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

type MobileMenuLink = {
  href: string;
  label: string;
};

type MobileMenuProps = {
  links: MobileMenuLink[];
  variant?: "light" | "dark";
  label?: string;
  hideAt?: "md" | "lg";
};

export function MobileMenu({
  links,
  variant = "light",
  label = "Menu",
  hideAt = "md",
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDark = variant === "dark";
  const visibilityClass = hideAt === "lg" ? "lg:hidden" : "md:hidden";

  return (
    <div className={`relative ${visibilityClass}`}>
      <button
        type="button"
        className={isDark ? "icon-button-dark" : "icon-button"}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Chiudi menu" : "Apri menu"}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
        <span>{label}</span>
      </button>

      {isOpen ? (
        <div
          className={`absolute right-0 top-14 z-30 w-[min(82vw,320px)] rounded-lg border p-2 shadow-[0_24px_70px_rgba(20,17,13,0.2)] ${
            isDark
              ? "border-cream/12 bg-graphite text-cream"
              : "border-ink/10 bg-cream text-ink"
          }`}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-md px-3 py-3 text-sm font-semibold ${
                isDark
                  ? "text-cream/78 hover:bg-cream/10 hover:text-cream"
                  : "text-muted hover:bg-fog hover:text-ink"
              }`}
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
