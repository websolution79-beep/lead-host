"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { AdminLeadNavBadge } from "@/components/admin-lead-nav-badge";
import { RoleSwitcher } from "@/components/role-switcher";
import { SupportNavBadge } from "@/components/support-nav-badge";

type MobileMenuLink = {
  href: string;
  label: string;
  group?: string;
  highlighted?: boolean;
  grouped?: boolean;
  subitem?: boolean;
  subitemLast?: boolean;
};

type MobileMenuProps = {
  links: MobileMenuLink[];
  supportHref?: string;
  supportSection?: "pm" | "admin";
  adminLeadBadgeHref?: string;
  roleSwitchSection?: "pm" | "admin";
  variant?: "light" | "dark";
  label?: string;
  hideAt?: "md" | "lg";
};

export function MobileMenu({
  links,
  supportHref,
  supportSection,
  adminLeadBadgeHref,
  roleSwitchSection,
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
            {links.map((link, index) => {
              if (link.subitem) return null;

              const previousGroup = links[index - 1]?.group;
              const showGroup = Boolean(link.group && link.group !== previousGroup);
              const renderLink = (item: MobileMenuLink, subitem = false) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-12 items-center rounded-lg px-4 text-base font-semibold ${
                    isDark
                      ? "text-cream/78 hover:bg-cream/10 hover:text-cream"
                      : subitem
                        ? `ml-3 rounded-lg text-slate-600 hover:bg-emerald-50 hover:text-ink`
                        : item.grouped
                          ? "bg-transparent text-emerald-800"
                          : item.highlighted
                            ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "text-slate-600 hover:bg-fog hover:text-ink"
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  {item.label}
                  {item.href === adminLeadBadgeHref ? <AdminLeadNavBadge /> : null}
                  {item.href === supportHref && supportSection ? (
                    <SupportNavBadge section={supportSection} />
                  ) : null}
                </Link>
              );

              return (
                <Fragment key={link.href}>
                  {showGroup ? (
                    <p
                      className={`mb-1 px-4 pt-4 text-[11px] font-bold uppercase ${
                        isDark ? "text-cream/45" : "text-slate-400"
                      }`}
                    >
                      {link.group}
                    </p>
                  ) : null}
                  {link.grouped && links.some((item) => item.subitem) ? (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50/35 p-1 shadow-[0_8px_24px_rgba(4,120,87,0.08)]">
                      {renderLink(link)}
                      {links.filter((item) => item.subitem).map((item) => renderLink(item, true))}
                    </div>
                  ) : (
                    renderLink(link)
                  )}
                </Fragment>
              );
            })}
            {roleSwitchSection ? (
              <RoleSwitcher section={roleSwitchSection} compact />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
