import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

type PmServiceRow = {
  id: string;
  service_code: string;
  service_label: string;
  delivery_model: string;
};

type PmAreaRow = {
  id: string;
  scope: string;
  region: string | null;
  province: string | null;
  city: string | null;
};

export const PM_SERVICE_OPTIONS = [
  { code: "full_management", label: "Gestione completa" },
  { code: "online_management", label: "Gestione online" },
  { code: "listing_management", label: "Gestione annunci" },
  { code: "revenue_management", label: "Revenue management" },
  { code: "guest_communication", label: "Comunicazione ospiti" },
  { code: "checkin_checkout", label: "Check-in / Check-out" },
  { code: "cleaning", label: "Pulizie" },
] as const;

export type PmServiceCode = (typeof PM_SERVICE_OPTIONS)[number]["code"];

export type PmOperationArea = {
  id?: string;
  scope: "region" | "province" | "city";
  region: string;
  province?: string | null;
  city?: string | null;
};

export type PmOperations = {
  propertyManagerId: string;
  services: Array<{
    id: string;
    code: PmServiceCode;
    label: string;
    deliveryModel: string;
  }>;
  areas: PmOperationArea[];
};

export type LeadMatchInput = {
  region: string;
  province: string;
  city: string;
  services: string[];
};

export type LeadMatchResult = {
  score: number | null;
  label: string;
  serviceMatches: string[];
  areaMatch: "city" | "province" | "region" | null;
  reason: string;
};

const serviceLabelByCode = new Map(PM_SERVICE_OPTIONS.map((item) => [item.code, item.label]));
const serviceCodeByLabel = new Map(
  PM_SERVICE_OPTIONS.map((item) => [normalize(item.label), item.code]),
);

export async function fetchPropertyManagerOperations({
  supabase,
  propertyManagerId,
}: {
  supabase: ServiceClient;
  propertyManagerId: string;
}): Promise<PmOperations> {
  const { data: services, error: servicesError } = await supabase
    .from("property_manager_services")
    .select("id,service_code,service_label,delivery_model,is_active")
    .eq("property_manager_id", propertyManagerId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (servicesError) throw servicesError;

  const serviceRows = ((services ?? []) as PmServiceRow[]).map((service) => ({
    id: service.id,
    code: normalizeServiceCode(service.service_code),
    label: service.service_label,
    deliveryModel: service.delivery_model,
  }));
  const serviceIds = serviceRows.map((service) => service.id);
  const { data: areas, error: areasError } = serviceIds.length
    ? await supabase
        .from("property_manager_areas")
        .select("id,scope,region,province,city")
        .in("property_manager_service_id", serviceIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (areasError) throw areasError;

  return {
    propertyManagerId,
    services: serviceRows,
    areas: dedupeAreas(
      ((areas ?? []) as PmAreaRow[]).map((area) => ({
        id: area.id,
        scope: normalizeAreaScope(area.scope),
        region: area.region ?? "",
        province: area.province,
        city: area.city,
      })),
    ),
  };
}

export async function savePropertyManagerOperations({
  supabase,
  propertyManagerId,
  serviceCodes,
  areas,
}: {
  supabase: ServiceClient;
  propertyManagerId: string;
  serviceCodes: PmServiceCode[];
  areas: PmOperationArea[];
}) {
  const { data: existingServices, error: existingError } = await supabase
    .from("property_manager_services")
    .select("id")
    .eq("property_manager_id", propertyManagerId);

  if (existingError) throw existingError;

  const existingServiceIds = ((existingServices ?? []) as Array<{ id: string }>).map(
    (service) => service.id,
  );

  if (existingServiceIds.length) {
    const { error: areasDeleteError } = await supabase
      .from("property_manager_areas")
      .delete()
      .in("property_manager_service_id", existingServiceIds);

    if (areasDeleteError) throw areasDeleteError;

    const { error: servicesDeleteError } = await supabase
      .from("property_manager_services")
      .delete()
      .eq("property_manager_id", propertyManagerId);

    if (servicesDeleteError) throw servicesDeleteError;
  }

  if (!serviceCodes.length) {
    return fetchPropertyManagerOperations({ supabase, propertyManagerId });
  }

  const serviceRows = serviceCodes.map((code) => ({
    property_manager_id: propertyManagerId,
    service_code: code,
    service_label: serviceLabelByCode.get(code) ?? code,
    delivery_model: "standard",
    is_active: true,
  }));
  const servicesTable = supabase.from("property_manager_services" as never) as unknown as {
    insert: (rows: Array<Record<string, unknown>>) => {
      select: (columns: string) => Promise<{
        data: Array<{ id: string; service_code: string }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
  const { data: insertedServices, error: insertServicesError } = await servicesTable
    .insert(serviceRows)
    .select("id,service_code");

  if (insertServicesError) throw insertServicesError;

  const areaRows = (insertedServices ?? []).flatMap((service) =>
    areas.map((area) => ({
      property_manager_service_id: service.id,
      scope: area.scope,
      region: area.region,
      province: area.scope === "region" ? null : area.province ?? null,
      city: area.scope === "city" ? area.city ?? null : null,
    })),
  );

  if (areaRows.length) {
    const areasTable = supabase.from("property_manager_areas" as never) as unknown as {
      insert: (rows: Array<Record<string, unknown>>) => Promise<{
        error: { message?: string } | null;
      }>;
    };
    const { error: insertAreasError } = await areasTable.insert(areaRows);

    if (insertAreasError) throw insertAreasError;
  }

  return fetchPropertyManagerOperations({ supabase, propertyManagerId });
}

export function calculateLeadMatch(
  lead: LeadMatchInput,
  operations: Pick<PmOperations, "services" | "areas"> | null,
): LeadMatchResult {
  if (!operations || !operations.services.length || !operations.areas.length) {
    return {
      score: null,
      label: "Configura operatività",
      serviceMatches: [],
      areaMatch: null,
      reason: "Aggiungi servizi e aree operative nel profilo per vedere il matching.",
    };
  }

  const pmServiceLabels = new Set(
    operations.services.map((service) => normalize(service.label)),
  );
  const serviceMatches = lead.services.filter((service) =>
    pmServiceLabels.has(normalize(service)),
  );
  const serviceScore = lead.services.length
    ? Math.round((serviceMatches.length / lead.services.length) * 50)
    : 20;
  const areaMatch = getBestAreaMatch(lead, operations.areas);
  const areaScore = areaMatch === "city" ? 50 : areaMatch === "province" ? 38 : areaMatch === "region" ? 25 : 0;
  const score = Math.min(100, serviceScore + areaScore);

  return {
    score,
    label: score >= 80 ? "Match alto" : score >= 55 ? "Match medio" : "Match basso",
    serviceMatches,
    areaMatch,
    reason: buildMatchReason({ serviceMatches, areaMatch }),
  };
}

export function normalizeServiceCode(value: string): PmServiceCode {
  return PM_SERVICE_OPTIONS.some((service) => service.code === value)
    ? (value as PmServiceCode)
    : "full_management";
}

export function serviceCodeFromLabel(label: string) {
  return serviceCodeByLabel.get(normalize(label));
}

function normalizeAreaScope(value: string): PmOperationArea["scope"] {
  return value === "city" || value === "province" || value === "region" ? value : "city";
}

function dedupeAreas(areas: PmOperationArea[]) {
  const seen = new Set<string>();

  return areas.filter((area) => {
    const key = [area.scope, area.region, area.province ?? "", area.city ?? ""].join("|");

    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}

function getBestAreaMatch(lead: LeadMatchInput, areas: PmOperationArea[]) {
  if (
    areas.some(
      (area) =>
        area.scope === "city" &&
        same(area.region, lead.region) &&
        same(area.province, lead.province) &&
        same(area.city, lead.city),
    )
  ) {
    return "city" as const;
  }

  if (
    areas.some(
      (area) =>
        ["province", "city"].includes(area.scope) &&
        same(area.region, lead.region) &&
        same(area.province, lead.province),
    )
  ) {
    return "province" as const;
  }

  if (areas.some((area) => same(area.region, lead.region))) {
    return "region" as const;
  }

  return null;
}

function buildMatchReason({
  serviceMatches,
  areaMatch,
}: {
  serviceMatches: string[];
  areaMatch: LeadMatchResult["areaMatch"];
}) {
  const areaLabel =
    areaMatch === "city"
      ? "città coperta"
      : areaMatch === "province"
        ? "provincia coperta"
        : areaMatch === "region"
          ? "regione coperta"
          : "zona non coperta";
  const serviceLabel = serviceMatches.length
    ? `${serviceMatches.length} servizi in comune`
    : "nessun servizio richiesto in comune";

  return `${areaLabel}, ${serviceLabel}.`;
}

function same(left?: string | null, right?: string | null) {
  return normalize(left) === normalize(right);
}

function normalize(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
