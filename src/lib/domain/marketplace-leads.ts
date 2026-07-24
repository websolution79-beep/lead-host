import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { MarketplaceLead } from "@/lib/domain/sample-data";
import type { Database } from "@/lib/supabase/database.types";
import { unstable_cache } from "next/cache";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";

type ServiceClient = SupabaseClient<Database>;

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type OwnerPublicContactRow = Pick<
  Database["public"]["Tables"]["owner_contacts"]["Row"],
  "precise_address"
>;
type OwnerRequestTimestampRow = Pick<
  Database["public"]["Tables"]["owner_requests"]["Row"],
  "id" | "created_at"
>;

export async function getPublishedMarketplaceLeads() {
  return getCachedPublishedMarketplaceLeads();
}

const getCachedPublishedMarketplaceLeads = unstable_cache(
  loadPublishedMarketplaceLeads,
  ["published-marketplace-leads"],
  {
    revalidate: 10,
    tags: [MARKETPLACE_LEADS_CACHE_TAG],
  },
);

async function loadPublishedMarketplaceLeads() {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,created_at,updated_at",
    )
    .not("published_at", "is", null)
    .or(`visible_until.is.null,visible_until.gte.${now}`)
    .order("published_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return mapLeadRowsToMarketplace(supabase, leads ?? []);
}

export async function getPublishedMarketplaceLeadById(id: string) {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (
    error ||
    !lead ||
    !lead.published_at ||
    (lead.visible_until && lead.visible_until < now)
  ) {
    return null;
  }

  const [mappedLead] = await mapLeadRowsToMarketplace(supabase, [lead]);

  return mappedLead ?? null;
}

async function mapLeadRowsToMarketplace(supabase: ServiceClient, leads: LeadRow[]) {
  const propertyIds = Array.from(new Set(leads.map((lead) => lead.property_id)));
  const ownerRequestIds = Array.from(new Set(leads.map((lead) => lead.owner_request_id)));

  if (propertyIds.length === 0) {
    return [];
  }

  const [
    propertiesResult,
    contactsResult,
    ownerRequestsResult,
    attributionResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id,region,province,city,district,property_type,bedrooms,bathrooms,beds,approximate_area_sqm,timing,description,requested_services",
      )
      .in("id", propertyIds),
    supabase
      .from("owner_contacts")
      .select("owner_request_id,precise_address")
      .in("owner_request_id", ownerRequestIds),
    supabase
      .from("owner_requests")
      .select("id,created_at")
      .in("id", ownerRequestIds),
    supabase
      .from("marketing_attribution")
      .select("owner_request_id,acquired_at")
      .in("owner_request_id", ownerRequestIds),
  ]);

  if (
    propertiesResult.error ||
    contactsResult.error ||
    ownerRequestsResult.error ||
    attributionResult.error
  ) {
    console.error(
      propertiesResult.error ??
        contactsResult.error ??
        ownerRequestsResult.error ??
        attributionResult.error,
    );
    return [];
  }

  const propertiesById = new Map(
    (propertiesResult.data ?? []).map((item) => [item.id, item]),
  );
  const contactsByRequestId = new Map(
    (contactsResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const ownerRequestsById = new Map(
    ((ownerRequestsResult.data ?? []) as OwnerRequestTimestampRow[]).map(
      (item) => [item.id, item],
    ),
  );
  const acquiredAtByRequestId = new Map(
    (attributionResult.data ?? []).map((item) => [
      item.owner_request_id,
      item.acquired_at,
    ]),
  );

  return leads
    .map((lead) => {
      const property = propertiesById.get(lead.property_id);

      if (!property) {
        return null;
      }

      return mapDbLeadToMarketplaceLead(
        lead,
        property,
        contactsByRequestId.get(lead.owner_request_id) ?? null,
        acquiredAtByRequestId.get(lead.owner_request_id) ??
          ownerRequestsById.get(lead.owner_request_id)?.created_at ??
          lead.created_at,
      );
    })
    .filter((lead): lead is MarketplaceLead => Boolean(lead));
}

function mapDbLeadToMarketplaceLead(
  lead: LeadRow,
  property: Pick<
    PropertyRow,
    | "region"
    | "province"
    | "city"
    | "district"
    | "property_type"
    | "bedrooms"
    | "bathrooms"
    | "beds"
    | "approximate_area_sqm"
    | "timing"
    | "description"
    | "requested_services"
  >,
  contact: OwnerPublicContactRow | null,
  requestedAt: string,
): MarketplaceLead {
  const now = new Date();
  const expiresAt = lead.expires_at ?? lead.visible_until ?? lead.created_at;
  const isExpired = new Date(expiresAt).getTime() <= now.getTime();
  const internalStatus =
    isExpired && ["available", "one_slot_sold"].includes(lead.internal_status)
      ? "withdrawn_after_7_days"
      : lead.internal_status;
  const publicStatus =
    internalStatus === "withdrawn_after_7_days" ? "unavailable" : lead.public_status;

  return {
    id: lead.id,
    title: lead.title,
    region: property.region ?? "Italia",
    province: property.province ?? "",
    city: property.city ?? "",
    district: property.district ?? property.city ?? "",
    address: formatAddressWithCity(
      contact?.precise_address ?? property.district ?? "",
      property.city,
    ),
    propertyType: property.property_type ?? "Immobile",
    bedrooms: property.bedrooms ?? 0,
    bathrooms: property.bathrooms ?? 0,
    beds: property.beds ?? property.bedrooms ?? 0,
    areaSqm: property.approximate_area_sqm ?? 0,
    timing: property.timing ?? "Da definire",
    services: property.requested_services ?? [],
    publicStatus,
    internalStatus,
    sharedSlotsSold: lead.shared_slots_sold,
    sharedPriceCents: lead.shared_price_cents,
    exclusivePriceCents: lead.exclusive_price_cents,
    exclusivePurchaseId: lead.exclusive_purchase_id,
    requestedAt,
    publishedAt: lead.published_at ?? lead.created_at,
    expiresAt,
    ownerDescription:
      property.description ??
      "Il proprietario non ha aggiunto una descrizione facoltativa.",
  };
}

function formatAddressWithCity(address: string, city: string | null) {
  const cleanAddress = address.trim();
  const cleanCity = city?.trim();

  if (!cleanAddress) {
    return cleanCity ?? "";
  }

  if (!cleanCity) {
    return cleanAddress;
  }

  return cleanAddress.toLocaleLowerCase("it").endsWith(
    `, ${cleanCity.toLocaleLowerCase("it")}`,
  )
    ? cleanAddress
    : `${cleanAddress}, ${cleanCity}`;
}
