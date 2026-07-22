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
        <>
          <button
            type="button"
            className="fixed inset-0 z-[80] bg-ink/20 backdrop-blur-[2px]"
            aria-label="Chiudi menu"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={`fixed inset-x-4 top-24 z-[100] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border p-2 shadow-[0_24px_70px_rgba(15,23,42,0.22)] ${
              isDark
                ? "border-cream/12 bg-graphite text-cream"
                : "border-slate-200 bg-white text-ink"
            }`}
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-h-12 items-center rounded-lg px-4 text-base font-semibold ${
                  isDark
                    ? "text-cream/78 hover:bg-cream/10 hover:text-cream"
                    : "text-slate-600 hover:bg-fog hover:text-ink"
                }`}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
