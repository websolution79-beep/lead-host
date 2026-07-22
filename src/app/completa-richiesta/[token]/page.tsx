import { Clock3, ShieldCheck } from "lucide-react";
import { OwnerRequestForm } from "@/components/owner-request-form";
import { PublicNav } from "@/components/public-nav";
import {
  hashOwnerRequestCompletionToken,
  isOwnerRequestCompletionExpired,
} from "@/lib/owner-requests/completion-token";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type CompletionPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CompletionPage({ params }: CompletionPageProps) {
  const { token } = await params;
  const result = await fetchCompletionInitialValues(token);

  return (
    <main className="bg-paper">
      <section className="mx-auto max-w-4xl px-5 py-5 sm:px-8">
        <PublicNav />
        <div className="my-10 grid gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <span className="inline-flex size-11 items-center justify-center rounded-xl bg-green/10 text-green">
              {result.ok ? <ShieldCheck size={23} /> : <Clock3 size={23} />}
            </span>
            <p className="section-kicker mt-5">Completamento richiesta</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              {result.ok
                ? "Completa i dettagli del tuo immobile"
                : "Link non disponibile"}
            </h1>
            <p className="mt-4 leading-7 text-muted">
              {result.ok
                ? "Abbiamo già ricevuto alcuni dati. Controllali, completa le informazioni mancanti e invia la richiesta al team Lead Host."
                : result.error}
            </p>
            {result.ok && result.expiresAt ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                Link valido fino al {formatDate(result.expiresAt)}.
              </p>
            ) : null}
          </div>

          {result.ok ? (
            <OwnerRequestForm
              completionToken={token}
              initialValues={result.initialValues}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function fetchCompletionInitialValues(token: string): Promise<
  | {
      ok: true;
      expiresAt: string | null;
      initialValues: {
        region: string;
        province: string;
        city: string;
        address: string;
        propertyType: string;
        bedrooms: string;
        bathrooms: string;
        areaSqm: string;
        currentStatus: string[];
        requestedServices: string[];
        timing: string;
        description: string;
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        privacyConsent: boolean;
        dataSharingConsent: boolean;
      };
    }
  | { ok: false; error: string }
> {
  const supabase = createServiceSupabaseClient();
  const tokenHash = hashOwnerRequestCompletionToken(token);
  const { data: ownerRequest, error } = await supabase
    .from("owner_requests")
    .select(
      "id,status,completion_token_expires_at,completion_token_invalidated_at",
    )
    .eq("completion_token_hash", tokenHash)
    .maybeSingle();

  if (error || !ownerRequest) {
    return { ok: false, error: "Il link non è valido oppure è già stato rimosso." };
  }

  if (ownerRequest.completion_token_invalidated_at) {
    return { ok: false, error: "Questo link è già stato utilizzato." };
  }

  if (isOwnerRequestCompletionExpired(ownerRequest.completion_token_expires_at)) {
    return { ok: false, error: "Questo link è scaduto. Richiedi un nuovo invio." };
  }

  if (!["waiting_for_completion", "new_from_meta"].includes(ownerRequest.status)) {
    return {
      ok: false,
      error: "La richiesta è già stata completata o non è più modificabile.",
    };
  }

  const [contactResult, propertyResult] = await Promise.all([
    supabase
      .from("owner_contacts")
      .select("first_name,last_name,email,phone,precise_address")
      .eq("owner_request_id", ownerRequest.id)
      .maybeSingle(),
    supabase
      .from("properties")
      .select(
        "region,province,city,property_type,bedrooms,bathrooms,approximate_area_sqm,current_status,requested_services,timing,description",
      )
      .eq("owner_request_id", ownerRequest.id)
      .maybeSingle(),
  ]);

  if (contactResult.error || propertyResult.error) {
    return {
      ok: false,
      error: "Non sono riuscito a caricare i dati della richiesta.",
    };
  }

  return {
    ok: true,
    expiresAt: ownerRequest.completion_token_expires_at,
    initialValues: {
      region: propertyResult.data?.region ?? "",
      province: propertyResult.data?.province ?? "",
      city: propertyResult.data?.city ?? "",
      address: contactResult.data?.precise_address ?? "",
      propertyType: propertyResult.data?.property_type ?? "",
      bedrooms: stringifyNumber(propertyResult.data?.bedrooms),
      bathrooms: stringifyNumber(propertyResult.data?.bathrooms),
      areaSqm: stringifyNumber(propertyResult.data?.approximate_area_sqm),
      currentStatus: propertyResult.data?.current_status ?? [],
      requestedServices: propertyResult.data?.requested_services ?? [],
      timing: propertyResult.data?.timing ?? "",
      description: propertyResult.data?.description ?? "",
      firstName: contactResult.data?.first_name ?? "",
      lastName: contactResult.data?.last_name ?? "",
      email: contactResult.data?.email ?? "",
      phone: contactResult.data?.phone ?? "",
      privacyConsent: false,
      dataSharingConsent: false,
    },
  };
}

function stringifyNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}
