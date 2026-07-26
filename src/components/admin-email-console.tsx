"use client";

import { useState } from "react";
import { FileText, Megaphone } from "lucide-react";
import { AdminEmailTemplatesConsole } from "@/components/admin-email-templates-console";
import { AdminServiceEmailsConsole } from "@/components/admin-service-emails-console";

type EmailView = "templates" | "service";

export function AdminEmailConsole() {
  const [activeView, setActiveView] = useState<EmailView>("templates");

  return (
    <div className="grid gap-6">
      <div
        className="inline-flex w-full gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-fit"
        role="tablist"
        aria-label="Sezioni email"
      >
        <ViewButton
          active={activeView === "templates"}
          icon={<FileText size={17} />}
          label="Template transazionali"
          onClick={() => setActiveView("templates")}
        />
        <ViewButton
          active={activeView === "service"}
          icon={<Megaphone size={17} />}
          label="Comunicazioni di servizio"
          onClick={() => setActiveView("service")}
        />
      </div>

      {activeView === "templates" ? (
        <AdminEmailTemplatesConsole />
      ) : (
        <AdminServiceEmailsConsole />
      )}
    </div>
  );
}

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition sm:flex-none ${
        active
          ? "bg-white text-ink shadow-sm"
          : "text-slate-600 hover:text-ink"
      }`}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
