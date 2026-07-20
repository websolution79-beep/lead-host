"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

export type PurchasedLeadItem = {
  purchaseId: string;
  leadId: string;
  purchaseMode: "shared" | "exclusive";
  amountCents: number;
  status: string;
  purchasedAt: string;
  unlockedAt: string;
  lead: {
    id: string;
    title: string;
    region: string;
    province: string;
    city: string;
    district: string;
    address: string;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    beds: number;
    areaSqm: number;
    timing: string;
    services: string[];
    ownerDescription: string;
  };
  ownerContact: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
};

export function MyLeadsCenter() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [purchasedLeads, setPurchasedLeads] = useState<PurchasedLeadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPurchasedLeads() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setError("Sessione scaduta. Effettua di nuovo il login.");
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/purchases/my-leads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as {
        purchases?: PurchasedLeadItem[];
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "Non e stato possibile caricare i lead acquistati.");
        setIsLoading(false);
        return;
      }

      setPurchasedLeads(result.purchases ?? []);
      setIsLoading(false);
    }

    loadPurchasedLeads();
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold text-ink">Carico i lead acquistati...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-2xl font-semibold text-ink">Accesso non disponibile</h2>
        <p className="mt-3 text-muted">{error}</p>
        <Link className="btn btn-secondary mt-5" href="/login">
          Vai al login
        </Link>
      </div>
    );
  }

  if (purchasedLeads.length === 0) {
    return (
      <div className="card p-8 text-center">
        <h2 className="text-2xl font-semibold text-ink">Nessun lead acquistato</h2>
        <p className="mt-3 text-muted">
          Quando acquisterai un lead dal marketplace, lo troverai qui con telefono
          ed email sbloccati.
        </p>
        <Link className="btn btn-primary mt-5" href="/app/marketplace">
          Vai al marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {purchasedLeads.map((item) => (
        <Link
          key={item.purchaseId}
          href={`/app/i-miei-lead/${item.leadId}`}
          className="card group block p-5 transition hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.1)]"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-green">
                <ShieldCheck size={16} />
                Contatto sbloccato
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-ink group-hover:text-green">
                {item.lead.title}
              </h2>
              <p className="mt-3 flex items-center gap-2 text-muted">
                <MapPin size={18} />
                {item.lead.address || `${item.lead.city}, zona ${item.lead.district}`}
              </p>
            </div>

            <div className="grid gap-2 text-sm text-muted lg:min-w-72">
              <span className={purchaseBadgeClassName(item.purchaseMode)}>
                {item.purchaseMode === "exclusive"
                  ? "Contatto in esclusiva"
                  : "Contatto condiviso"}
              </span>
              <p className="flex items-center gap-3">
                <UserRound size={17} className="text-green" />
                {item.ownerContact.firstName} {item.ownerContact.lastName}
              </p>
              <p className="flex items-center gap-3">
                <Phone size={17} className="text-green" />
                {item.ownerContact.phone}
              </p>
              <p className="flex items-center gap-3">
                <Mail size={17} className="text-green" />
                {item.ownerContact.email}
              </p>
              <p className="flex items-center gap-3">
                <CalendarClock size={17} />
                Sbloccato il {formatDate(item.unlockedAt)}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
            <span className="text-sm font-semibold text-muted">
              Contatto acquistato e accessibile
            </span>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-green">
              Apri dettaglio
              <ArrowRight size={16} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function purchaseBadgeClassName(mode: "shared" | "exclusive") {
  const base =
    "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold";

  if (mode === "exclusive") {
    return `${base} bg-blue-100 text-blue-700`;
  }

  return `${base} bg-mint text-green`;
}
