import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { createBnbcalcCohostAnalysis } from "@/lib/bnbcalc/client";
import { convertAmountToEur } from "@/lib/bnbcalc/currency";
import { BnbcalcApiError } from "@/lib/bnbcalc/response";
import { getEnv } from "@/lib/env";

type RouteContext = {
  params: Promise<{ ownerRequestId: string }>;
};

const analysisSchema = z.object({
  requestKey: z.string().uuid(),
  fullAddress: z.string().trim().min(5).max(500),
  bedrooms: z.number().min(0).max(50),
  bathrooms: z.number().min(0).max(50),
  accommodates: z.number().int().min(1).max(100),
});

type BnbcalcRun = {
  id: string;
  status: "processing" | "completed" | "failed";
  adr_eur: number | null;
  occupancy_percentage: number | null;
  source_currency: string | null;
  eur_conversion_rate: number | null;
  exchange_rate_date: string | null;
  bnbcalc_report_url: string | null;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const { supabase } = await requireSuperAdmin(request);
    const [defaults, latest] = await Promise.all([
      getPropertyDefaults(supabase, ownerRequestId),
      supabase
        .from("bnbcalc_analysis_runs")
        .select("*")
        .eq("owner_request_id", ownerRequestId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (latest.error) throw latest.error;

    return NextResponse.json(
      {
        configured: Boolean(getEnv("BNBCALC_API_KEY")),
        defaults,
        latestAnalysis: latest.data ? toPublicResult(latest.data) : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return bnbcalcErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { ownerRequestId } = await context.params;
  let runId: string | null = null;
  let supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"] | null = null;

  try {
    const payload = analysisSchema.parse(await request.json());
    const admin = await requireSuperAdmin(request);
    supabase = admin.supabase;
    await requireOwnerRequest(supabase, ownerRequestId);

    const previous = await supabase
      .from("bnbcalc_analysis_runs")
      .select("*")
      .eq("request_key", payload.requestKey)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data) return idempotentResponse(previous.data);

    const inserted = await supabase
      .from("bnbcalc_analysis_runs")
      .insert({
        owner_request_id: ownerRequestId,
        requested_by_profile_id: admin.profile.id,
        request_key: payload.requestKey,
        full_address: payload.fullAddress,
        bedrooms: payload.bedrooms,
        bathrooms: payload.bathrooms,
        accommodates: payload.accommodates,
        requested_currency: "EUR",
      })
      .select("id")
      .single();

    if (inserted.error?.code === "23505") {
      const raced = await supabase
        .from("bnbcalc_analysis_runs")
        .select("*")
        .eq("request_key", payload.requestKey)
        .single();
      if (raced.error) throw raced.error;
      return idempotentResponse(raced.data);
    }
    if (inserted.error) throw inserted.error;
    runId = inserted.data.id;

    const analysis = await createBnbcalcCohostAnalysis(payload);
    const conversion = await convertAmountToEur(
      analysis.adr,
      analysis.sourceCurrency,
    );

    const completed = await supabase
      .from("bnbcalc_analysis_runs")
      .update({
        status: "completed",
        source_currency: analysis.sourceCurrency,
        source_adr: analysis.adr,
        eur_conversion_rate: conversion.conversionRate,
        exchange_rate_date: conversion.rateDate,
        adr_eur: conversion.amountEur,
        occupancy_percentage: analysis.occupancyPercentage,
        bnbcalc_analysis_id: analysis.analysisId,
        bnbcalc_report_url: analysis.reportUrl,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select("*")
      .single();
    if (completed.error) throw completed.error;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: admin.profile.id,
      isSuperAdmin: admin.isSuperAdmin,
      entityType: "bnbcalc_analysis_run",
      entityId: runId,
      action: "completed",
      after: {
        owner_request_id: ownerRequestId,
        source_currency: analysis.sourceCurrency,
        adr_eur: conversion.amountEur,
        occupancy_percentage: analysis.occupancyPercentage,
      },
    });

    return NextResponse.json(toPublicResult(completed.data));
  } catch (error) {
    if (supabase && runId) {
      await supabase
        .from("bnbcalc_analysis_runs")
        .update({
          status: "failed",
          error_message: readableError(error).slice(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return bnbcalcErrorResponse(error);
  }
}

async function getPropertyDefaults(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  ownerRequestId: string,
) {
  await requireOwnerRequest(supabase, ownerRequestId);
  const [contact, property] = await Promise.all([
    supabase
      .from("owner_contacts")
      .select("precise_address")
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle(),
    supabase
      .from("properties")
      .select("city,province,region,bedrooms,bathrooms,beds")
      .eq("owner_request_id", ownerRequestId)
      .maybeSingle(),
  ]);
  if (contact.error) throw contact.error;
  if (property.error) throw property.error;

  return {
    fullAddress: composeAddress([
      contact.data?.precise_address,
      property.data?.city,
      property.data?.province,
      property.data?.region,
      "Italia",
    ]),
    bedrooms: property.data?.bedrooms ?? null,
    bathrooms: property.data?.bathrooms ?? null,
    accommodates: property.data?.beds ?? null,
  };
}

async function requireOwnerRequest(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
  ownerRequestId: string,
) {
  const ownerRequest = await supabase
    .from("owner_requests")
    .select("id")
    .eq("id", ownerRequestId)
    .maybeSingle();
  if (ownerRequest.error) throw ownerRequest.error;
  if (!ownerRequest.data) {
    throw new BnbcalcApiError("Richiesta proprietario non trovata.", 404);
  }
}

function composeAddress(parts: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLocaleLowerCase("it-IT");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function idempotentResponse(run: BnbcalcRun) {
  if (run.status === "completed") {
    return NextResponse.json({ ...toPublicResult(run), idempotent: true });
  }

  return NextResponse.json(
    {
      error:
        run.status === "processing"
          ? "Analisi già in corso. Attendi il completamento."
          : "Il precedente tentativo non è riuscito. Avvia una nuova analisi.",
    },
    { status: 409 },
  );
}

function toPublicResult(run: BnbcalcRun) {
  return {
    runId: run.id,
    adrEur: run.adr_eur,
    occupancyPercentage: run.occupancy_percentage,
    sourceCurrency: run.source_currency,
    convertedFromUsd: run.source_currency === "USD",
    conversionRate: run.eur_conversion_rate,
    exchangeRateDate: run.exchange_rate_date,
    reportUrl: run.bnbcalc_report_url,
  };
}

function bnbcalcErrorResponse(error: unknown) {
  if (error instanceof BnbcalcApiError) {
    const status =
      error.status && error.status >= 400 && error.status < 500
        ? error.status
        : 502;
    return NextResponse.json({ error: error.message }, { status });
  }
  return adminApiErrorResponse(error);
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Errore BNBCalc non identificato.";
}
